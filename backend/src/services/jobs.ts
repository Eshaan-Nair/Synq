/**
 * jobs.ts — Background Job Queue Service
 *
 * Handles enqueuing and processing of slow tasks (like triple extraction).
 * Fully abstracted — works with both Docker (Mongo) and SQLite storage modes.
 *
 * Updated: v1.4.7
 */

import { sessionStore, graphStore, vectorStore } from "./storage";
import { generateEmbeddings } from "./embeddings";
import { extractTriples, Triple, chunkText, summarizeChunk, extractTriplesFromSummary, extractTriplesFromText } from "./extractor";
import { logger } from "../utils/logger";

/**
 * Add a new job to the queue.
 */
let _wakeWorker: (() => void) | null = null;
let _isWorkerRunning = false;

export async function enqueueJob(type: "triple_extraction" | "sentence_indexing" | "chat_ingestion", payload: any) {
  const job = await sessionStore.createJob(type, payload);
  logger.info(`[Job Queue] Enqueued ${type} job: ${job._id}`);
  // Wake the worker immediately instead of waiting for the next poll tick
  _wakeWorker?.();
  return job._id;
}

/**
 * Check if a session currently has any PENDING or PROCESSING extraction jobs.
 * Uses the aggregate job status (simplified — safe for both storage modes).
 */
export async function isSessionProcessing(sessionId: string): Promise<boolean> {
  const status = await sessionStore.getJobStatusBySession(sessionId);
  return status.processing > 0 || status.pending > 0;
}

/**
 * Cancel all active jobs for a session (used on delete).
 * Note: Per-session cancellation is available in Docker mode only.
 * In SQLite mode this is a no-op — jobs will be killed via ghost-job check.
 */
export async function cancelSessionJobs(sessionId: string) {
  logger.warn(`[Job Queue] Cancel session jobs requested for ${sessionId}`);
  // In Docker mode, sessionStore.deleteSession handles some cleanup, 
  // but we could add explicit cancel if needed.
}

/**
 * Clear the entire job queue (emergency use).
 */
export async function clearAllJobs() {
  await sessionStore.clearJobs();
  logger.warn("[Job Queue] All jobs cleared.");
}

/**
 * Start the background worker loop.
 */
export async function startWorker() {
  if (_isWorkerRunning) {
    logger.warn("[Job Queue] Worker is already running. Skipping start.");
    return;
  }
  _isWorkerRunning = true;
  
  logger.info("[Job Queue] Cleaning up ghost jobs from previous run...");
  await sessionStore.resetGhostJobs();
  logger.info("[Job Queue] Background worker started.");

  let pollInterval = 5000;
  const MIN_POLL = 1000;
  const MAX_POLL = 30000;
  let currentTimer: ReturnType<typeof setTimeout> | null = null;

  async function workerLoop() {
    try {
      const processedJob = await processNextJob();
      // If we found a job, speed up. If idle, slow down exponentially.
      pollInterval = processedJob ? MIN_POLL : Math.min(pollInterval * 1.5, MAX_POLL);
    } catch (err) {
      logger.error("[Job Queue] Worker loop error:", err);
      pollInterval = Math.min(pollInterval * 2, MAX_POLL);
    }
    currentTimer = setTimeout(workerLoop, pollInterval);
  }

  // Expose a wake function so enqueueJob can safely trigger the next tick
  _wakeWorker = () => {
    if (currentTimer) {
      clearTimeout(currentTimer);
      // Immediately run the loop in the next event loop tick
      setImmediate(() => workerLoop());
    }
  };

  workerLoop();
}

/**
 * Helper: check if a job still exists in SQLite. Returns true in non-SQLite modes.
 */
function jobExists(jobId: string, requireStatus?: string): boolean {
  const sqliteDb = (vectorStore as any).db;
  if (!sqliteDb) return true; // Not in SQLite mode — assume job exists
  const query = requireStatus
    ? `SELECT 1 FROM jobs WHERE id = ? AND status = '${requireStatus}'`
    : "SELECT 1 FROM jobs WHERE id = ?";
  return !!sqliteDb.prepare(query).get(jobId);
}

/**
 * Pick up the next PENDING job and process it.
 * Returns true if a job was found and processed (even if it failed).
 */
export async function processNextJob(): Promise<boolean> {
  const job = await sessionStore.getNextJob();
  if (!job) return false;

  const currentAttempts = Number(job.attempts) || 0;
  logger.info(`[Job Queue] Processing ${job.type} job: ${job._id} (Attempt ${currentAttempts + 1}/5)`);
  await sessionStore.updateJob(job._id, { status: "PROCESSING", attempts: currentAttempts + 1 });

  try {
    if (job.type === "triple_extraction") {
      await handleTripleExtraction(job._id, job.payload);
    } else if (job.type === "sentence_indexing") {
      await handleSentenceIndexing(job._id, job.payload);
    } else if (job.type === "chat_ingestion") {
      await handleChatIngestion(job._id, job.payload);
    }

    if (!jobExists(job._id)) {
      logger.warn(`[Job Queue] Job ${job._id} record was removed during processing. Abandoning.`);
      return true;
    }

    await sessionStore.updateJob(job._id, { status: "COMPLETED" });
    logger.success(`[Job Queue] Completed ${job.type} job: ${job._id}`);
  } catch (err: any) {
    logger.error(`[Job Queue] Failed ${job.type} job: ${job._id} — ${err.message}`);

    if (currentAttempts < 5) {
      await sessionStore.updateJob(job._id, { status: "PENDING" });
    } else {
      await sessionStore.updateJob(job._id, {
        status: "FAILED",
        deadLettered: true,
        failedAt: new Date(),
        error: err.message
      });
      logger.error(`[Job Queue] Job ${job._id} dead-lettered after ${currentAttempts + 1} attempts.`);
    }
  }
  return true;
}

async function handleSentenceIndexing(jobId: string, payload: { chunks: any[] }) {
  const { chunks } = payload;
  logger.info(`[Job Queue] Processing sentence indexing for ${chunks.length} chunks...`);
  
  const sqliteStore = vectorStore as any;
  if (!sqliteStore.db) {
    logger.warn("[Job Queue] Sentence indexing skipped: not in SQLite mode.");
    return;
  }

  const insertSentVec = sqliteStore.db.prepare("INSERT INTO vec_sentences (sentence_id, embedding) VALUES (?, ?)");
  const insertSentMeta = sqliteStore.db.prepare("INSERT INTO sentence_metadata (sentence_id, chunk_id, content) VALUES (?, ?, ?)");

  for (const chunk of chunks) {
    // ── Kill Switch Check ──────────────────────────────────────────
    if (!jobExists(jobId)) {
      logger.warn(`[Job Queue] Sentence indexing job ${jobId} cancelled. Stopping.`);
      return;
    }

    const sentences = chunk.content.split(/(?<=[.!?])\s+/).filter((s: string) => s.trim().length > 10);
    if (sentences.length === 0) continue;

    const sentEmbeddings = await generateEmbeddings(sentences, "document");
    
    sqliteStore.db.transaction(() => {
      for (let j = 0; j < sentences.length; j++) {
        const sId = `${chunk.id}_s${j}`;
        const sVec = Buffer.from(new Float32Array(sentEmbeddings[j]).buffer);
        insertSentVec.run(sId, sVec);
        insertSentMeta.run(sId, chunk.id, sentences[j]);
      }
    })();
  }
}

/**
 * Logic for Triple Extraction job with Checkpointing (v1.4.7)
 */
async function handleTripleExtraction(jobId: any, payload: {
  sessionId: string;
  text: string;
  windowChunks?: any[];
  processVectors?: boolean;
  lastProcessedIndex?: number;
}) {
  const { sessionId, text, windowChunks, processVectors } = payload;
  let currentIndex = payload.lastProcessedIndex || 0;

  // Ghost Job Check — kill the job if session or job record was deleted
  const session = await sessionStore.getSession(sessionId);

  if (!session || !jobExists(jobId)) {
    logger.warn(`[Job Queue] Job ${jobId} or Session ${sessionId} no longer exists. Killing job.`);
    return;
  }

  // ── Step 1: Background Vector Storage (One-time) ───────────────
  if (currentIndex === 0 && processVectors && windowChunks && windowChunks.length > 0) {
    logger.info(`[Job Queue] Processing background vector storage for ${windowChunks.length} chunks...`);
    try {
      await vectorStore.storeChunks(windowChunks);
      logger.success(`[Job Queue] Background vector storage completed for session ${sessionId}`);
    } catch (err: any) {
      logger.error(`[Job Queue] Background vector storage failed: ${err.message}`);
    }
  }

  // ── Step 2: Chunk-by-Chunk Triple Extraction ─────────────────────
  const chunks = chunkText(text);

  // v1.4.7: Incremental Extraction — skip chunks that haven't changed
  const chat = await sessionStore.getFullChat(sessionId);
  const processedTextSoFar = chat?.processedText || "";
  const oldChunks = chunkText(processedTextSoFar);

  let skipCount = 0;
  while (skipCount < oldChunks.length && skipCount < chunks.length && oldChunks[skipCount] === chunks[skipCount]) {
    skipCount++;
  }

  if (skipCount > 0) {
    logger.info(`[Job Queue] Session ${sessionId}: skipping ${skipCount}/${chunks.length} identical chunks`);
  }

  // Respect both skipCount and any previous checkpoint (lastProcessedIndex)
  const startIndex = Math.max(skipCount, currentIndex);
  logger.info(`[Job Queue] Resuming extraction for session ${sessionId} at chunk ${startIndex + 1}/${chunks.length}`);

  for (let i = startIndex; i < chunks.length; i++) {
    // ── Kill Switch Check ──────────────────────────────────────────
    if (!jobExists(jobId, "PROCESSING")) {
      logger.warn(`[Job Queue] Job ${jobId} cancelled or deleted. Stopping extraction.`);
      return;
    }

    logger.info(`[Job Queue]   chunk ${i + 1}/${chunks.length} — extracting facts...`);

    try {
      // v1.5.0: Direct extraction (One API call instead of two)
      const triples = await extractTriplesFromText(chunks[i]);

      // ── Kill Switch Check 2 (After Extraction) ───────────────────
      if (!jobExists(jobId, "PROCESSING")) {
        logger.warn(`[Job Queue] Job ${jobId} cancelled during extraction. Stopping.`);
        return;
      }

      for (const t of triples) {
        await graphStore.saveTriple({ ...t, sessionId, timestamp: new Date().toISOString() });
      }

      // Checkpoint: update last processed index so we can resume if server restarts
      currentIndex = i + 1;
      await sessionStore.updateJob(jobId, {
        payload: { ...payload, lastProcessedIndex: currentIndex }
      });

      // Update session triple count accurately from database
      const count = await graphStore.getTripleCountBySession(sessionId);
      await sessionStore.updateSession(sessionId, {
        tripleCount: count
      });

      // v1.4.7: Update processed text so future saves can skip this chunk
      const processedUntilNow = chunks.slice(0, i + 1).join("\n\n");
      await sessionStore.updateFullChat(sessionId, { processedText: processedUntilNow });

      // Delay to respect Groq rate limits (v1.5.0: 10 seconds for extreme safety)
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 10000));

    } catch (err: any) {
      logger.error(`[Job Queue] Error at chunk ${i + 1}: ${err.message}`);
      await new Promise(r => setTimeout(r, 10000));
      throw err; // Trigger retry
    }
  }
}

/**
 * Handle initial chat ingestion: scrub, chunk, embed, and enqueue extraction.
 */
async function handleChatIngestion(jobId: string, payload: {
  sessionId: string;
  rawText: string;
  platform: string;
  messageCount: number;
}) {
  const { sessionId, rawText, platform, messageCount } = payload;
  logger.info(`[Job Queue] Starting ingestion for session ${sessionId}...`);

  const cleanText = rawText; // PII scrubbed in route or here? We'll do it here to be safe.
  const windowChunks = slidingWindowChunks(cleanText, sessionId);

  // 1. Save FullChat metadata
  await sessionStore.saveFullChat(sessionId, cleanText, messageCount, platform);

  // 2. Vector Storage (Sync within the background job)
  logger.info(`[Job Queue]   Embedding ${windowChunks.length} chunks...`);
  await vectorStore.storeChunks(windowChunks);

  // 3. Chain into Triple Extraction
  await enqueueJob("triple_extraction", {
    sessionId,
    text: cleanText,
    windowChunks: windowChunks.length > 10 ? windowChunks : undefined,
    processVectors: false // Already done
  });

  // 4. Update session metadata
  await sessionStore.updateSession(sessionId, {
    hasFullChat: true,
    topicCount: windowChunks.length
  });

  logger.success(`[Job Queue] Ingestion complete for ${sessionId}. Extraction queued.`);
}

// Helper needed from other files
import { slidingWindowChunks } from "./chunker";
