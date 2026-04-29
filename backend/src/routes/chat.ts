/**
 * chat.ts (backend route) — v1.2
 *
 * RAG pipeline change:
 * - splitIntoTopics (Groq) replaced with slidingWindowChunks (pure function)
 * - Nothing is filtered, nothing is lost — personal facts survive
 * - Graph extraction (extractTriples) is unchanged
 *
 * FullChat.topics now stores a lightweight preview of each chunk
 * (chunkIndex + first 120 chars) for display in the dashboard Chat tab.
 */

import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { slidingWindowChunks } from "../services/chunker";
import { storeWindowChunks, deleteChunksBySession } from "../services/chroma";
import { extractTriples } from "../services/extractor";
import { saveTriple } from "../services/neo4j";
import { Session, FullChat } from "../services/mongo";
import { logger } from "../utils/logger";
import mongoose from "mongoose";

const router = Router();

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// POST /api/chat/save
router.post("/save", async (req: Request, res: Response) => {
  const { rawText, sessionId, platform, messageCount } = req.body;

  if (!rawText || !sessionId) {
    res.status(400).json({ error: "rawText and sessionId are required" });
    return;
  }
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }
  if (rawText.trim().length < 50) {
    res.status(400).json({ error: "Chat content too short to process (min 50 chars)" });
    return;
  }

  try {
    logger.info(`Saving chat for session ${sessionId} (${rawText.length} chars)`);

    const cleanText = scrubPII(rawText);

    // ── RAG: Sliding window chunks (no Groq — nothing lost) ────────
    logger.info("Chunking with sliding window...");
    const windowChunks = slidingWindowChunks(cleanText, sessionId);
    logger.info(`Created ${windowChunks.length} window chunk(s)`);

    // Upsert FullChat — store raw text + lightweight chunk previews for the Chat tab
    await FullChat.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        rawText: cleanText,
        // Store preview of each chunk for the dashboard Chat tab
        topics: windowChunks.map(c => ({
          name:     `Chunk ${c.chunkIndex + 1}`,
          content:  c.content.slice(0, 120) + (c.content.length > 120 ? "…" : ""),
          keywords: [],
        })),
        platform,
        messageCount: messageCount || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Store all window chunks in ChromaDB for RAG (non-fatal — Ollama may be down)
    let vectorsStored = false;
    try {
      await storeWindowChunks(windowChunks);
      vectorsStored = true;
    } catch (vecErr: any) {
      logger.warn(`Vector storage failed (Ollama may be down): ${vecErr?.message || vecErr}`);
      logger.warn("RAG recall will not work until Ollama is running. Chat data still saved.");
    }

    // ── Graph: Groq extraction pipeline (non-fatal — Groq may be rate-limited) ──
    let triplesCount = 0;
    try {
      logger.info("Extracting triples for knowledge graph...");
      const triples = await extractTriples(cleanText);

      for (const t of triples) {
        await saveTriple(
          t.subject, t.subjectType,
          t.relation,
          t.object, t.objectType,
          sessionId
        );
      }
      triplesCount = triples.length;
    } catch (graphErr: any) {
      logger.warn(`Graph extraction failed (Groq may be down): ${graphErr?.message || graphErr}`);
      logger.warn("Knowledge graph will not update. Chat data still saved.");
    }

    await Session.findByIdAndUpdate(sessionId, {
      updatedAt:  new Date(),
      hasFullChat: true,
      topicCount:  windowChunks.length,
      $inc: { tripleCount: triplesCount },
    });

    const warnings: string[] = [];
    if (!vectorsStored) warnings.push("RAG vectors not stored (Ollama down)");
    if (triplesCount === 0) warnings.push("No triples extracted (Groq may be down)");

    logger.success(`Chat saved: ${windowChunks.length} chunks, ${triplesCount} triples${warnings.length ? ` [${warnings.join(", ")}]` : ""}`);

    res.json({
      success: true,
      chunksStored:     windowChunks.length,
      triplesExtracted: triplesCount,
      topicsExtracted:  windowChunks.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    logger.error("Chat save error:", err);
    res.status(500).json({ error: "Failed to save chat" });
  }
});

// GET /api/chat/:sessionId
router.get("/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const chat = await FullChat.findOne({ sessionId });
    if (!chat) {
      res.json({ found: false });
      return;
    }
    res.json({
      found:        true,
      rawText:      chat.rawText,
      topics:       chat.topics,
      messageCount: chat.messageCount,
      topicCount:   chat.topics?.length || 0,
      createdAt:    chat.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve chat" });
  }
});

// DELETE /api/chat/:sessionId
router.delete("/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  try {
    await FullChat.findOneAndDelete({ sessionId });
    await deleteChunksBySession(sessionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

export default router;