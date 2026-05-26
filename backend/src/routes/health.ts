import { Router, Request, Response } from "express";
import { sessionStore, vectorStore } from "../services/storage";
import { logger } from "../utils/logger";
import { getSettings } from "../utils/settings";

const router = Router();

// GET /api/health
// Returns live system metrics: chunk count, session count, job queue, storage mode, Ollama status
router.get("/", async (_req: Request, res: Response) => {
  try {
    const storageMode = (process.env.ARCRIFT_STORAGE_MODE || "docker").toLowerCase();

    // Session + chunk counts
    const sessions = await sessionStore.getSessions();
    const sessionCount = sessions.length;

    // Total chunk count — sum topicCount across all sessions as a quick proxy
    const chunkCount = sessions.reduce((acc, s) => acc + (s.topicCount || 0), 0);

    // Job queue status
    const jobStatus = await sessionStore.getJobStatus();

    // Ollama reachability
    let ollamaReachable = false;
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      ollamaReachable = resp.ok;
    } catch {
      ollamaReachable = false;
    }

    const settings = getSettings();
    const activeExtractionModel = settings.ollamaExtractionModel || process.env.OLLAMA_MODEL || "llama3.1:8b";

    res.json({
      storageMode,
      sessionCount,
      chunkCount,
      jobQueue: jobStatus,
      graphBackend: (process.env.GRAPH_BACKEND || "ollama").toUpperCase(),
      ollama: {
        reachable: ollamaReachable,
        model: activeExtractionModel,
      },
    });
  } catch (err: any) {
    logger.error("Health check failed:", err?.message);
    res.status(500).json({ error: "Health check failed" });
  }
});

export default router;
