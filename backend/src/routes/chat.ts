/**
 * chat.ts (backend route) — v1.4.1
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
import { enqueueJob } from "../services/jobs";
import { Session, FullChat } from "../services/mongo";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";

const router = Router();

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
      { upsert: true, returnDocument: 'after' }
    );

    // ── RAG: Vector Storage (Hybrid Sync/Async) ───────────────────
    const CHUNK_THRESHOLD = 10;
    const isLargeChat = windowChunks.length > CHUNK_THRESHOLD;
    let vectorsStored = false;

    if (!isLargeChat) {
      try {
        logger.info(`Storing ${windowChunks.length} chunks in ChromaDB (sync)...`);
        await storeWindowChunks(windowChunks);
        vectorsStored = true;
      } catch (vecErr: any) {
        logger.warn(`Sync vector storage failed: ${vecErr?.message}`);
      }
    } else {
      logger.info(`Mega chat detected (${windowChunks.length} chunks) — offloading vector storage to background.`);
    }

    // ── Graph: Async Triple Extraction (v1.4.1+) ───────────────────
    let jobId = null;
    try {
      jobId = await enqueueJob("triple_extraction", { 
        sessionId: sessionId.toString(), 
        text: cleanText,
        windowChunks: isLargeChat ? windowChunks : undefined, // Pass chunks if we need to process them in background
        processVectors: isLargeChat 
      });
    } catch (jobErr: any) {
      logger.error(`Failed to enqueue extraction job: ${jobErr.message}`);
    }

    await Session.findByIdAndUpdate(sessionId, {
      updatedAt:  new Date(),
      hasFullChat: true,
      topicCount:  windowChunks.length,
    });

    const warnings: string[] = [];
    if (!vectorsStored) warnings.push("RAG vectors not stored (Ollama down)");
    if (!jobId) warnings.push("Background extraction task failed to start");

    logger.success(`Chat saved: ${windowChunks.length} chunks enqueued for graph extraction${warnings.length ? ` [${warnings.join(", ")}]` : ""}`);

    res.json({
      success: true,
      chunksStored:     windowChunks.length,
      triplesExtracted: 0, // Now 0 initially because it's async
      topicsExtracted:  windowChunks.length,
      jobId,
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