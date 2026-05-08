/**
 * chat.ts (backend route) — v1.4.2
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
import { sessionStore, vectorStore } from "../services/storage";
import { enqueueJob } from "../services/jobs";
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

    // Save FullChat
    await sessionStore.saveFullChat(sessionId, cleanText, messageCount || 0, platform || "unknown");
    
    // ── RAG: Vector Storage (Hybrid Sync/Async) ───────────────────
    const CHUNK_THRESHOLD = 10;
    const isLargeChat = windowChunks.length > CHUNK_THRESHOLD;
    let vectorsStored = false;
    let vectorError = "";

    if (!isLargeChat) {
      try {
        logger.info(`Storing ${windowChunks.length} chunks (sync)...`);
        await vectorStore.storeChunks(windowChunks);
        vectorsStored = true;
      } catch (vecErr: any) {
        vectorError = vecErr?.message || "Unknown error";
        logger.warn(`Sync vector storage failed: ${vectorError}`);
      }
    } else {
      logger.info(`Mega chat detected (${windowChunks.length} chunks) — offloading vector storage to background.`);
    }

    // ── Graph: Async Triple Extraction (v1.4.2+) ───────────────────
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

    await sessionStore.updateSession(sessionId, {
      hasFullChat: true,
      topicCount:  windowChunks.length,
    });

    const warnings: string[] = [];
    if (!vectorsStored) warnings.push(`RAG vectors not stored (${vectorError || "Ollama down"})`);
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
    const chat = await sessionStore.getFullChat(sessionId as string);
    if (!chat) {
      res.json({ found: false });
      return;
    }
    
    // Generate topics on the fly for the dashboard
    const chunks = slidingWindowChunks(chat.rawText, sessionId as string);
    const topics = chunks.map(c => ({
      name: `Chunk ${c.chunkIndex + 1}`,
      content: c.content.slice(0, 120) + (c.content.length > 120 ? "…" : ""),
      keywords: []
    }));

    res.json({
      found:        true,
      rawText:      chat.rawText,
      topics,
      messageCount: chat.messageCount,
      topicCount:   topics.length,
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
    // Note: sessionStore.deleteSession handles chat deletion in SQLite
    // but in Docker mode it might need explicit call
    // For safety, we keep deleteChunksBySession
    await vectorStore.deleteChunksBySession(sessionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

export default router;
