/**
 * chat.ts (backend route) — v1.4.7
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

    // ── Offload everything to background job ────────
    const jobId = await enqueueJob("chat_ingestion", {
      sessionId,
      rawText: cleanText,
      platform: platform || "unknown",
      messageCount: messageCount || 0
    });

    logger.success(`Chat save initiated for ${sessionId}. Ingestion queued.`);

    res.json({
      success: true,
      jobId,
      message: "Syncing to brain initiated..."
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
      found: true,
      rawText: chat.rawText,
      topics,
      messageCount: chat.messageCount,
      topicCount: topics.length,
      createdAt: chat.createdAt,
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
