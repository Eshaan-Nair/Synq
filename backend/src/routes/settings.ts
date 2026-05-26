import { Router, Request, Response } from "express";
import axios from "axios";
import { getSettings, updateSettings } from "../utils/settings";
import { logger } from "../utils/logger";

const router = Router();
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

// GET /api/settings
router.get("/", async (_req: Request, res: Response) => {
  try {
    const settings = getSettings();
    let ollamaReachable = false;
    let availableModels: string[] = [];

    try {
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
      ollamaReachable = true;
      if (response.data && Array.isArray(response.data.models)) {
        availableModels = response.data.models.map((m: any) => m.name);
      }
    } catch {
      ollamaReachable = false;
    }

    const activeEmbeddingModel = settings.ollamaEmbeddingModel || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    const activeExtractionModel = settings.ollamaExtractionModel || process.env.OLLAMA_MODEL || "llama3.1:8b";

    res.json({
      ollamaReachable,
      availableModels,
      activeEmbeddingModel,
      activeExtractionModel
    });
  } catch (err: any) {
    logger.error("Failed to fetch settings:", err?.message);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /api/settings
router.post("/", async (req: Request, res: Response) => {
  try {
    const { activeEmbeddingModel, activeExtractionModel } = req.body;

    const updated = updateSettings({
      ollamaEmbeddingModel: activeEmbeddingModel,
      ollamaExtractionModel: activeExtractionModel
    });

    res.json({
      success: true,
      settings: updated
    });
  } catch (err: any) {
    logger.error("Failed to update settings:", err?.message);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
