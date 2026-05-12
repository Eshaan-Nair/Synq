// rag.ts (backend route) — v1.4.6

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

  // v1.4.6: Use unified validator for Mongo/SQLite IDs
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  // v1.4.6: Character-based context budgeting
  // We retrieve a larger pool and fill until the budget is reached.
  const MAX_TOTAL_CHARS = 6000;

  try {
    logger.info(`RAG retrieve (budget=${MAX_TOTAL_CHARS} chars): "${String(prompt).slice(0, 60)}..." for session ${sessionId}`);

    // ── Hybrid Search (Graph Enrichment) ───────────────────
    const entities = await extractEntitiesFromQuery(prompt);
    let relatedTriples: any[] = [];
    if (entities.length > 0) {
      relatedTriples = await graphStore.findRelatedTriples(entities, sessionId);
    }

    // Retrieve a larger candidate pool for budgeting with Keyword Boosting
    const candidateChunks = await vectorStore.retrieveRelevantChunks(prompt, sessionId, 10, entities);

    if (candidateChunks.length === 0 && relatedTriples.length === 0) {
      res.json({ found: false, chunks: [], graphFacts: [] });
      return;
    }

    // Fill budget
    const safeChunks: RetrievedChunk[] = [];
    let currentChars = 0;

    for (const chunk of candidateChunks) {
      if (currentChars + chunk.content.length > MAX_TOTAL_CHARS) {
        // If the very first chunk is huge, truncate it
        if (safeChunks.length === 0) {
          const truncated = chunk.content.slice(0, MAX_TOTAL_CHARS);
          safeChunks.push({ ...chunk, content: truncated + "\n... (truncated for budget)" });
        }
        break;
      }
      safeChunks.push(chunk);
      currentChars += chunk.content.length;
    }

    // Sanitise (redact injection patterns) then wrap in XML delimiters
    const sanitized = sanitizeChunks(safeChunks);

    // v1.4.4 style: inject raw chunks directly (no LLM extraction step)
    let contextBlockRaw = wrapInContextBlock(sanitized);
    if (relatedTriples.length > 0) {
      const graphText = relatedTriples.map(t => `- ${t.subject} ${t.relation} ${t.object}`).join("\n");
      contextBlockRaw = `RELATED KNOWLEDGE:\n${graphText}\n\nRETRIEVED CONTEXT:\n${contextBlockRaw}`;
    }

    const contextBlock = contextBlockRaw.trim();
    if (!contextBlock) {
      res.json({ found: false, chunks: [], graphFacts: [] });
      return;
    }

    logger.success(`RAG: Budget filled (${currentChars}/${MAX_TOTAL_CHARS} chars). ${sanitized.length} chunks used.`);

    res.json({
      found: true,
      chunks: sanitized,
      graphFacts: relatedTriples,
      contextBlock,
      chunksFound: sanitized.map(c => c.chunkIndex),
      scores: sanitized.map(c => c.score),
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

  // v1.4.6: Character-based context budgeting
  const MAX_TOTAL_CHARS = 4000; // Lower for global to avoid noisy context

  try {
    logger.info(`RAG Global (budget=${MAX_TOTAL_CHARS}): "${String(prompt).slice(0, 60)}..."`);

    // Extract entities for Global search boosting
    const entities = await extractEntitiesFromQuery(prompt);

    // Retrieve a larger candidate pool with Keyword Boosting
    const candidateChunks = await vectorStore.retrieveGlobalChunks(prompt, 8, entities);

    if (candidateChunks.length === 0) {
      res.json({ found: false, chunks: [] });
      return;
    }

    // Fill budget
    const safeChunks: RetrievedChunk[] = [];
    let currentChars = 0;

    for (const chunk of candidateChunks) {
      if (currentChars + chunk.content.length > MAX_TOTAL_CHARS) break;
      safeChunks.push(chunk);
      currentChars += chunk.content.length;
    }

    const sanitized = sanitizeChunks(safeChunks);
    const contextBlock = wrapInContextBlock(sanitized).trim();
    
    if (!contextBlock) {
      res.json({ found: false, chunks: [] });
      return;
    }

    logger.success(`RAG Global: Budget filled (${currentChars}/${MAX_TOTAL_CHARS} chars). ${sanitized.length} chunks used.`);

    res.json({
      found: true,
      chunks: sanitized,
      contextBlock,
      scores: sanitized.map(c => c.score),
    });
  } catch (err) {
    logger.error("Global RAG error:", err);
    res.status(500).json({ error: "Failed to retrieve global context" });
  }
});

export default router;
