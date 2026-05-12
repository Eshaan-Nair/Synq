/**
 * jobs.ts — Background Job Queue Service
 *
 * Handles enqueuing and processing of slow tasks (like triple extraction).
 * Fully abstracted — works with both Docker (Mongo) and SQLite storage modes.
 *
 * Updated: v1.4.7
 */

import { sessionStore, graphStore, vectorStore } from "./storage";
import { extractTriples, Triple, chunkText, summarizeChunk, extractTriplesFromSummary } from "./extractor";
import { logger } from "../utils/logger";

/**
 * Add a new job to the queue.
 */
export async function enqueueJob(type: "triple_extraction", payload: any) {
  const job = await sessionStore.createJob(type, payload);
  logger.info(`[Job Queue] Enqueued ${type} job: ${job._id}`);
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
  logger.info("[Job Queue] Cleaning up ghost jobs from previous run...");
  await sessionStore.resetGhostJobs();
  logger.info("[Job Queue] Background worker started.");

  let pollInterval = 5000;
  const MIN_POLL = 1000;
  const MAX_POLL = 30000;

  async function workerLoop() {
    try {
      const processedJob = await processNextJob();
      // If we found a job, speed up. If idle, slow down exponentially.
      pollInterval = processedJob ? MIN_POLL : Math.min(pollInterval * 1.5, MAX_POLL);
    } catch (err) {
      logger.error("[Job Queue] Worker loop error:", err);
      pollInterval = Math.min(pollInterval * 2, MAX_POLL);
    }
    setTimeout(workerLoop, pollInterval);
  }

  workerLoop();
}

/**
 * Pick up the next PENDING job and process it.
 * Returns true if a job was found and processed (even if it failed).
 */
export async function processNextJob(): Promise<boolean> {
  const job = await sessionStore.getNextJob();
  if (!job) return false;

  logger.info(`[Job Queue] Processing ${job.type} job: ${job._id} (Attempt ${job.attempts}/5)`);
  await sessionStore.updateJob(job._id, { status: "PROCESSING", attempts: job.attempts + 1 });

  try {
    if (job.type === "triple_extraction") {
      await handleTripleExtraction(job._id, job.payload);
    }

    await sessionStore.updateJob(job._id, { status: "COMPLETED" });
    logger.success(`[Job Queue] Completed ${job.type} job: ${job._id}`);
  } catch (err: any) {
    logger.error(`[Job Queue] Failed ${job.type} job: ${job._id} — ${err.message}`);

    if (job.attempts < 5) {
      await sessionStore.updateJob(job._id, { status: "PENDING" });
    } else {
      await sessionStore.updateJob(job._id, {
        status: "FAILED",
        deadLettered: true,
        failedAt: new Date(),
        error: err.message
      });
      logger.error(`[Job Queue] Job ${job._id} dead-lettered after ${job.attempts} attempts.`);
    }
  }
  return true;
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

  // Ghost Job Check — kill the job if session was deleted
  const session = await sessionStore.getSession(sessionId);
  if (!session) {
    logger.warn(`[Job Queue] Session ${sessionId} not found. Killing ghost job.`);
    await sessionStore.updateJob(jobId, { status: "FAILED", error: "Session deleted" });
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
  logger.info(`[Job Queue] Resuming extraction for session ${sessionId} at chunk ${currentIndex + 1}/${chunks.length}`);

  for (let i = currentIndex; i < chunks.length; i++) {
    logger.info(`[Job Queue]   chunk ${i + 1}/${chunks.length} — summarizing...`);

    try {
      const summary = await summarizeChunk(chunks[i]);
      const triples = await extractTriplesFromSummary(summary);

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

      // Delay to respect Groq rate limits
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 3000));

    } catch (err: any) {
      logger.error(`[Job Queue] Error at chunk ${i + 1}: ${err.message}`);
      await new Promise(r => setTimeout(r, 10000));
      throw err; // Trigger retry
    }
  }
}
