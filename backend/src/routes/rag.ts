/**
 * rag.ts (backend route) — v1.4.2
 *
 * v1.4.2 changes:
 * - Migrated to unified vectorStore abstraction for SQLite support.
 * - All retrieved chunks are now piped through sanitizeChunks() to redact
 *   any prompt injection patterns before they reach the AI's context window.
 * - Context block is wrapped in <synq_retrieved_context> XML delimiters
 *   so LLMs treat the content as data, not instructions.
 *
 * Updated: v1.4.2
 */

import { Router, Request, Response } from "express";
import { vectorStore, RetrievedChunk } from "../services/storage";
import { logger } from "../utils/logger";
import { wrapInContextBlock, sanitizeChunks } from "../middleware/sanitize";
import { isValidObjectId } from "../utils/validators";

const router = Router();

// POST /api/rag/retrieve
router.post("/retrieve", async (req: Request, res: Response) => {
  let { prompt, sessionId, topN = 3 } = req.body;

  if (!prompt || !sessionId) {
    res.status(400).json({ error: "prompt and sessionId are required" });
    return;
  }

  // v1.4.2: Use unified validator for Mongo/SQLite IDs
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  // Clamp topN — sliding window chunks are smaller so allow up to 6
  topN = Math.max(1, Math.min(Number(topN) || 3, 6));

  try {
    logger.info(`RAG retrieve (topN=${topN}): "${String(prompt).slice(0, 60)}..." for session ${sessionId}`);

    const rawChunks = await vectorStore.retrieveRelevantChunks(prompt, sessionId, topN);

    if (rawChunks.length === 0) {
      logger.info("RAG: no chunks above threshold — skipping injection");
      res.json({ found: false, chunks: [] });
      return;
    }

    // ── v1.4.2: Sanitise chunks before returning ───────────────────
    const MAX_CONTEXT_CHARS = 1500;
    const cappedChunks: RetrievedChunk[] = rawChunks.map(c => ({
      ...c,
      content: c.content.length > MAX_CONTEXT_CHARS
        ? c.content.slice(0, MAX_CONTEXT_CHARS) + "\n… (truncated)"
        : c.content,
    }));

    // Sanitise (redact injection patterns) then wrap in XML delimiters
    const safeChunks = sanitizeChunks(cappedChunks);
    const contextBlock = wrapInContextBlock(safeChunks);

    logger.success(`RAG: ${safeChunks.length} chunk(s) found — scores: ${safeChunks.map(c => c.score.toFixed(2)).join(", ")}`);

    res.json({
      found: true,
      chunks:      safeChunks,
      contextBlock,
      chunksFound: safeChunks.map(c => c.chunkIndex),
      scores:      safeChunks.map(c => c.score),
    });
  } catch (err) {
    logger.error("RAG error:", err);
    res.status(500).json({ error: "Failed to retrieve context" });
  }
});

// POST /api/rag/global — search across ALL sessions
router.post("/global", async (req: Request, res: Response) => {
  let { prompt, topN = 3 } = req.body;

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  topN = Math.max(1, Math.min(Number(topN) || 2, 4));

  try {
    logger.info(`Global RAG retrieve (topN=${topN}): "${String(prompt).slice(0, 60)}..."`);

    const rawChunks = await vectorStore.retrieveGlobalChunks(prompt, topN);

    if (rawChunks.length === 0) {
      res.json({ found: false, chunks: [] });
      return;
    }

    const safeChunks = sanitizeChunks(rawChunks);
    const contextBlock = wrapInContextBlock(safeChunks, true);

    logger.success(`Global RAG: ${safeChunks.length} chunk(s) found`);

    res.json({
      found: true,
      chunks: safeChunks,
      contextBlock,
    });
  } catch (err) {
    logger.error("Global RAG error:", err);
    res.status(500).json({ error: "Failed to retrieve global context" });
  }
});

export default router;
