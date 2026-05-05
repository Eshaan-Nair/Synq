/**
 * rag.ts (backend route) — v1.4.1
 *
 * v1.4.1 changes:
 * - All retrieved chunks are now piped through sanitizeChunks() to redact
 *   any prompt injection patterns before they reach the AI's context window.
 * - Context block is wrapped in <synq_retrieved_context> XML delimiters
 *   so LLMs treat the content as data, not instructions.
 *
 * Updated: v1.4.1
 * - Context header shows chunk position + relevance % (not topic name)
 * - topN default raised to 3 — window chunks are smaller so we need more
 * - topicsFound renamed to chunksFound for clarity
 */

import { Router, Request, Response } from "express";
import { retrieveRelevantChunks } from "../services/chroma";
import { logger } from "../utils/logger";
import { wrapInContextBlock, sanitizeChunks } from "../middleware/sanitize";

const router = Router();

// POST /api/rag/retrieve
router.post("/retrieve", async (req: Request, res: Response) => {
  let { prompt, sessionId, topN = 3 } = req.body;

  // v1.4.1: Strict validation of sessionId as string
  if (typeof sessionId !== "string" || !sessionId.match(/^[0-9a-fA-F]{24}$/)) {
    res.status(400).json({ error: "Invalid sessionId format (must be 24-char hex string)" });
    return;
  }

  if (!prompt || !sessionId) {
    res.status(400).json({ error: "prompt and sessionId are required" });
    return;
  }

  // Clamp topN — sliding window chunks are smaller so allow up to 6
  topN = Math.max(1, Math.min(Number(topN) || 3, 6));

  try {
    logger.info(`RAG retrieve (topN=${topN}): "${String(prompt).slice(0, 60)}..." for session ${sessionId}`);

    const rawChunks = await retrieveRelevantChunks(prompt, sessionId, topN);

    if (rawChunks.length === 0) {
      logger.info("RAG: no chunks above threshold — skipping injection");
      res.json({ found: false, chunks: [] });
      return;
    }

    // ── v1.4.1: Sanitise chunks before returning ───────────────────
    // Cap each chunk at 1500 chars to avoid platform prompt length limits,
    // then run injection filter + XML wrapping.
    const MAX_CONTEXT_CHARS = 1500;
    const cappedChunks = rawChunks.map(c => ({
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
    logger.error("RAG retrieve error:", err);
    res.status(500).json({ error: "Failed to retrieve context" });
  }
});

export default router;