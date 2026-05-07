/**
 * jobs.ts — Background Job Queue Service
 * 
 * Handles enqueuing and processing of slow tasks (like triple extraction)
 * using a MongoDB-backed polling worker.
 */

import { Job, Session } from "./mongo";
import { extractTriples, Triple, chunkText, summarizeChunk, extractTriplesFromSummary } from "./extractor";
import { saveTriple } from "./neo4j";
import { storeWindowChunks } from "./chroma";
import { logger } from "../utils/logger";

/**
 * Add a new job to the queue.
 */
export async function enqueueJob(type: "triple_extraction", payload: any) {
  const job = await Job.create({ type, payload });
  logger.info(`[Job Queue] Enqueued ${type} job: ${job._id}`);
  return job._id;
}

/**
 * Check if a session currently has any PENDING or PROCESSING extraction jobs.
 */
export async function isSessionProcessing(sessionId: string): Promise<boolean> {
  const count = await Job.countDocuments({
    "payload.sessionId": sessionId.toString(),
    status: { $in: ["PENDING", "PROCESSING"] }
  });
  return count > 0;
}

/**
 * Cancel all active jobs for a session (used on delete).
 */
export async function cancelSessionJobs(sessionId: string) {
  await Job.updateMany(
    { "payload.sessionId": sessionId.toString(), status: { $in: ["PENDING", "PROCESSING"] } },
    { status: "FAILED", error: "Cancelled by user" }
  );
  logger.warn(`[Job Queue] Cancelled all active jobs for session ${sessionId}`);
}

/**
 * Clear the entire job queue (emergency use).
 */
export async function clearAllJobs() {
  await Job.updateMany(
    { status: { $in: ["PENDING", "PROCESSING"] } },
    { status: "FAILED", error: "Cleared by emergency command" }
  );
  logger.warn("[Job Queue] Emergency clear: All active jobs cancelled.");
}

/**
 * Start the background worker loop.
 */
export async function startWorker() {
  const recovered = await Job.updateMany(
    { status: "PROCESSING" },
    { status: "PENDING" }
  );
  if (recovered.modifiedCount > 0) {
    logger.info(`[Job Queue] Recovered ${recovered.modifiedCount} stuck jobs.`);
  }

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
  const job = await Job.findOneAndUpdate(
    { status: "PENDING", deadLettered: false },
    { status: "PROCESSING", $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  if (!job) return false;

  logger.info(`[Job Queue] Processing ${job.type} job: ${job._id} (Attempt ${job.attempts}/5)`);

  try {
    if (job.type === "triple_extraction") {
      await handleTripleExtraction(job._id, job.payload);
    }
    
    job.status = "COMPLETED";
    await job.save();
    logger.success(`[Job Queue] Completed ${job.type} job: ${job._id}`);
  } catch (err: any) {
    logger.error(`[Job Queue] Failed ${job.type} job: ${job._id} — ${err.message}`);
    
    if (job.attempts < 5) {
      job.status = "PENDING";
    } else {
      job.status = "FAILED";
      job.deadLettered = true;
      job.failedAt = new Date();
      job.error = err.message;
      logger.error(`[Job Queue] Job ${job._id} dead-lettered after ${job.attempts} attempts.`);
    }
    await job.save();
  }
  return true;
}

/**
 * Logic for Triple Extraction job with Checkpointing (v1.4.1)
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
  
  // v1.4.1+: Ghost Job Check - If session was deleted, kill the job
  const sessionExists = await Session.exists({ _id: sessionId });
  if (!sessionExists) {
    logger.warn(`[Job Queue] Session ${sessionId} not found. Killing ghost job.`);
    await Job.findByIdAndUpdate(jobId, { status: "FAILED", error: "Session deleted" });
    return;
  }
  
  // ── Step 1: Background Vector Storage (One-time) ───────────────
  // If we haven't even started chunk 0, process vectors
  if (currentIndex === 0 && processVectors && windowChunks && windowChunks.length > 0) {
    logger.info(`[Job Queue] Processing background vector storage for ${windowChunks.length} chunks...`);
    try {
      await storeWindowChunks(windowChunks);
      logger.success(`[Job Queue] Background vector storage completed for session ${sessionId}`);
    } catch (err: any) {
      logger.error(`[Job Queue] Background vector storage failed: ${err.message}`);
    }
  }

  // ── Step 2: Chunk-by-Chunk Triple Extraction ─────────────────────
  const chunks = chunkText(text);
  logger.info(`[Job Queue] Resuming extraction for session ${sessionId} at chunk ${currentIndex + 1}/${chunks.length}`);

  for (let i = currentIndex; i < chunks.length; i++) {
    // v1.4.1+: Check if job was cancelled by user while we were working
    const currentJob = await Job.findById(jobId);
    if (!currentJob || currentJob.status !== "PROCESSING") {
      logger.warn(`[Job Queue] Stopping extraction for ${sessionId} (Job was cancelled/changed)`);
      return;
    }

    logger.info(`[Job Queue]   chunk ${i + 1}/${chunks.length} — summarizing...`);
    
    try {
      const summary = await summarizeChunk(chunks[i]);
      const triples = await extractTriplesFromSummary(summary);
      
      for (const t of triples) {
        await saveTriple(t.subject, t.subjectType, t.relation, t.object, t.objectType, sessionId);
      }

      // Checkpoint: Update job payload so we can resume if we crash
      currentIndex = i + 1;
      await Job.findByIdAndUpdate(jobId, { 
        "payload.lastProcessedIndex": currentIndex 
      });

      // Update session triple count
      await Session.findByIdAndUpdate(sessionId, {
        $inc: { tripleCount: triples.length }
      });
      
      // Delay to respect Groq limits
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 3000));

    } catch (err: any) {
      logger.error(`[Job Queue] Error at chunk ${i + 1}: ${err.message}`);
      // Wait 10s before failing to allow rate limits to cool down
      await new Promise(r => setTimeout(r, 10000));
      throw err; // Stop and retry later
    }
  }
}
