/**
 * rag.ts (backend route) — v1.4.3
 *
 * v1.4.3 changes:
 * - Implemented Hybrid Retrieval (Vector + Knowledge Graph).
 *
 * Updated: v1.4.3
 */

import { Router, Request, Response } from "express";
import { vectorStore, graphStore, RetrievedChunk } from "../services/storage";
import { extractEntitiesFromQuery } from "../services/extractor";
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

    // ── Hybrid Search (Graph Enrichment) ───────────────────
    const entities = await extractEntitiesFromQuery(prompt);
    let relatedTriples: any[] = [];
    if (entities.length > 0) {
      relatedTriples = await graphStore.findRelatedTriples(entities, sessionId);
    }

    // ── v1.4.2: Vector retrieval + Sanitise chunks ─────────────────
    const rawChunks = await vectorStore.retrieveRelevantChunks(prompt, sessionId, topN);

    if (rawChunks.length === 0 && relatedTriples.length === 0) {
      res.json({ found: false, chunks: [], graphFacts: [] });
      return;
    }

    const MAX_CONTEXT_CHARS = 1500;
    const cappedChunks: RetrievedChunk[] = rawChunks.map(c => ({
      ...c,
      content: c.content.length > MAX_CONTEXT_CHARS
        ? c.content.slice(0, MAX_CONTEXT_CHARS) + "\n… (truncated)"
        : c.content,
    }));

    // Sanitise (redact injection patterns) then wrap in XML delimiters
    const safeChunks = sanitizeChunks(cappedChunks);
    
    // Merge graph knowledge into the context block
    let contextBlock = wrapInContextBlock(safeChunks);
    if (relatedTriples.length > 0) {
      const graphText = relatedTriples.map(t => `- ${t.subject} ${t.relation} ${t.object}`).join("\n");
      contextBlock = `<synq_graph_knowledge>\n${graphText}\n</synq_graph_knowledge>\n\n${contextBlock}`;
    }

    logger.success(`RAG: ${safeChunks.length} chunk(s) and ${relatedTriples.length} graph triple(s) found`);

    res.json({
      found: true,
      chunks:      safeChunks,
      graphFacts:  relatedTriples,
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
