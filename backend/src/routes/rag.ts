/**
 * rag.ts (backend route) — v1.2
 *
 * Updated for sliding window chunks:
 * - Context header shows chunk position + relevance % (not topic name)
 * - topN default raised to 3 — window chunks are smaller so we need more
 * - topicsFound renamed to chunksFound for clarity
 */

import { Router, Request, Response } from "express";
import { retrieveRelevantChunks } from "../services/chroma";
import { logger } from "../utils/logger";

const router = Router();

// POST /api/rag/retrieve
router.post("/retrieve", async (req: Request, res: Response) => {
  let { prompt, sessionId, topN = 3 } = req.body;

  if (!prompt || !sessionId) {
    res.status(400).json({ error: "prompt and sessionId are required" });
    return;
  }

  // Clamp topN — sliding window chunks are smaller so allow up to 6
  topN = Math.max(1, Math.min(Number(topN) || 3, 6));

  try {
    logger.info(`RAG retrieve (topN=${topN}): "${String(prompt).slice(0, 60)}..." for session ${sessionId}`);

    const chunks = await retrieveRelevantChunks(prompt, sessionId, topN);

    if (chunks.length === 0) {
      logger.info("RAG: no chunks above threshold — skipping injection");
      res.json({ found: false, chunks: [] });
      return;
    }

    // Cap each chunk at 1500 chars to avoid platform prompt length limits
    const MAX_CONTEXT_CHARS = 1500;
    const contextBlock = chunks
      .map(c => {
        const content = c.content.length > MAX_CONTEXT_CHARS
          ? c.content.slice(0, MAX_CONTEXT_CHARS) + "\n… (truncated)"
          : c.content;
        return `### Context ${c.chunkIndex + 1} (relevance: ${(c.score * 100).toFixed(0)}%)\n${content}`;
      })
      .join("\n\n---\n\n");

    logger.success(`RAG: ${chunks.length} chunk(s) found — scores: ${chunks.map(c => c.score.toFixed(2)).join(", ")}`);

    res.json({
      found: true,
      chunks,
      contextBlock,
      chunksFound: chunks.map(c => c.chunkIndex),
      scores:      chunks.map(c => c.score),
    });
  } catch (err) {
    logger.error("RAG retrieve error:", err);
    res.status(500).json({ error: "Failed to retrieve context" });
  }
});

export default router;