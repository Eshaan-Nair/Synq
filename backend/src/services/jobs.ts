import { sessionStore, graphStore } from "./storage";
import { extractTriples } from "./extractor";
import { logger } from "../utils/logger";

let isRunning = false;
let pollingInterval: NodeJS.Timeout | null = null;

const processingSessions = new Set<string>();

export async function startWorker() {
  if (isRunning) return;
  isRunning = true;
  logger.info("[Job Queue] Background worker started.");
  
  // Poll every 5 seconds
  pollingInterval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (err) {
      logger.error("[Job Queue] Polling error:", err);
    }
  }, 5000);
}

export async function stopWorker() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isRunning = false;
  logger.info("[Job Queue] Background worker stopped.");
}

async function processNextJob() {
  const job = await sessionStore.getNextJob();
  if (!job) return;

  const jobId = job._id.toString();
  const sessionId = job.payload.sessionId;

  try {
    logger.info(`[Job Queue] Processing job ${jobId} (${job.type})`);
    await sessionStore.updateJob(jobId, { status: "PROCESSING" });
    
    if (sessionId) processingSessions.add(sessionId);

    if (job.type === "triple_extraction") {
      const { text, platform } = job.payload;
      const { triples } = await extractTriples(text);

      for (const t of triples) {
        await graphStore.saveTriple({
          ...t,
          sessionId,
          timestamp: new Date().toISOString()
        });
      }

      const session = await sessionStore.getSession(sessionId);
      if (session) {
        await sessionStore.updateSession(sessionId, {
          tripleCount: (session.tripleCount || 0) + triples.length,
          updatedAt: new Date()
        });
      }
    }

    await sessionStore.updateJob(jobId, { status: "COMPLETED" });
    logger.info(`[Job Queue] Job ${jobId} completed successfully.`);
  } catch (err: any) {
    logger.error(`[Job Queue] Job ${jobId} failed: ${err.message}`);
    
    const attempts = (job.attempts || 0) + 1;
    const deadLettered = attempts >= 5;

    await sessionStore.updateJob(jobId, { 
      status: "FAILED", 
      attempts,
      deadLettered,
      error: err.message,
      failedAt: new Date()
    });
  } finally {
    if (sessionId) processingSessions.delete(sessionId);
  }
}

export async function isSessionProcessing(sessionId: string): Promise<boolean> {
  return processingSessions.has(sessionId);
}

export async function cancelSessionJobs(sessionId: string) {
  // In a full implementation, we would query the store for all PENDING jobs for this sessionId and delete them.
  // For now, we clear the set if it's currently processing.
  processingSessions.delete(sessionId);
}

export async function clearAllJobs() {
  await sessionStore.clearJobs();
  processingSessions.clear();
}
