import { Router, Request, Response } from "express";
import { vectorStore } from "../services/storage";
import { sanitizeChunks, wrapInContextBlock } from "../middleware/sanitize";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";

const router = Router();

// POST /api/rag/retrieve
router.post("/retrieve", async (req: Request, res: Response) => {
  const { query, sessionId, topN } = req.body;

  if (!query || !sessionId) {
    res.status(400).json({ error: "query and sessionId are required" });
    return;
  }
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  try {
    const rawChunks = await vectorStore.retrieveRelevantChunks(query, sessionId, topN || 3);
    
    // Fallback to global search if local search is empty
    if (rawChunks.length === 0) {
      logger.info(`No local chunks found for session ${sessionId}. Falling back to global search.`);
      const globalChunks = await vectorStore.retrieveGlobalChunks(query, topN || 3);
      const safeChunks = sanitizeChunks(globalChunks);
      const context = wrapInContextBlock(safeChunks, true);
      res.json({ context, chunks: safeChunks, isGlobal: true });
      return;
    }

    const safeChunks = sanitizeChunks(rawChunks);
    const context = wrapInContextBlock(safeChunks);
    res.json({ context, chunks: safeChunks, isGlobal: false });
  } catch (err: any) {
    logger.error(`RAG retrieval failed: ${err.message}`);
    res.status(500).json({ error: "RAG retrieval failed" });
  }
});

// POST /api/rag/search-global
router.post("/search-global", async (req: Request, res: Response) => {
  const { query, topN } = req.body;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const rawChunks = await vectorStore.retrieveGlobalChunks(query, topN || 5);
    const safeChunks = sanitizeChunks(rawChunks);
    res.json({ chunks: safeChunks });
  } catch (err: any) {
    res.status(500).json({ error: "Global search failed" });
  }
});

export default router;