import { Router, Request, Response } from "express";
import { sessionStore, vectorStore } from "../services/storage";
import { scrubPII } from "../utils/privacy";
import { slidingWindowChunks } from "../services/chunker";
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

    // ── RAG: Sliding window chunks
    logger.info("Chunking with sliding window...");
    const windowChunks = slidingWindowChunks(cleanText, sessionId);
    logger.info(`Created ${windowChunks.length} window chunk(s)`);

    // Save FullChat
    await sessionStore.saveFullChat(sessionId, cleanText, messageCount || 0, platform || "unknown");
    
    // Vector Storage
    await vectorStore.storeChunks(windowChunks);

    // Create Background Job for Knowledge Extraction
    await sessionStore.createJob("triple_extraction", {
      sessionId,
      text: cleanText,
      platform
    });

    res.json({ success: true, chunksStored: windowChunks.length });
  } catch (err: any) {
    logger.error(`Failed to save chat: ${err.message}`);
    res.status(500).json({ error: "Internal server error during chat save" });
  }
});

// GET /api/chat/:sessionId
router.get("/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  try {
    const chat = await sessionStore.getFullChat(sessionId);
    if (!chat) {
      res.json({ found: false });
      return;
    }
    
    // Generate topics on the fly for the dashboard
    const chunks = slidingWindowChunks(chat.rawText, sessionId);
    const topics = chunks.map(c => ({
      name: `Chunk ${c.chunkIndex + 1}`,
      content: c.content.slice(0, 120) + (c.content.length > 120 ? "…" : ""),
      keywords: []
    }));

    res.json({
      found: true,
      rawText: chat.rawText,
      messageCount: chat.messageCount,
      platform: chat.platform,
      topics
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

export default router;