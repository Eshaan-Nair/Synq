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
  // v1.4.1+: Recovery - Reset any jobs stuck in PROCESSING from a previous crash/restart
  const recovered = await Job.updateMany(
    { status: "PROCESSING" },
    { status: "PENDING" }
  );
  if (recovered.modifiedCount > 0) {
    logger.info(`[Job Queue] Recovered ${recovered.modifiedCount} stuck jobs.`);
  }

  logger.info("[Job Queue] Background worker started.");
  
  // Poll every 5 seconds for new jobs
  setInterval(async () => {
    try {
      await processNextJob();
    } catch (err) {
      logger.error("[Job Queue] Worker error:", err);
    }
  }, 5000);
}

/**
 * Pick up the next PENDING job and process it.
 */
async function processNextJob() {
  // Atomic find and update to prevent multiple workers (if scaled) from picking the same job
  const job = await Job.findOneAndUpdate(
    { status: "PENDING" },
    { status: "PROCESSING", $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  if (!job) return;

  logger.info(`[Job Queue] Processing ${job.type} job: ${job._id}`);

  try {
    if (job.type === "triple_extraction") {
      await handleTripleExtraction(job._id, job.payload);
    }
    
    job.status = "COMPLETED";
    await job.save();
    logger.success(`[Job Queue] Completed ${job.type} job: ${job._id}`);
  } catch (err: any) {
    logger.error(`[Job Queue] Failed ${job.type} job: ${job._id} — ${err.message}`);
    
    // Retry logic: allow up to 5 attempts
    if (job.attempts < 5) {
      job.status = "PENDING";
    } else {
      job.status = "FAILED";
      job.error = err.message;
    }
    await job.save();
  }
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
