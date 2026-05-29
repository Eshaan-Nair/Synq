import path from "path";
import fs from "fs";
import { logger } from "./logger";

export interface Settings {
  ollamaEmbeddingModel?: string;
  ollamaExtractionModel?: string;
  contextMode?: "raw" | "summarized";
}

const SETTINGS_PATH = path.join(process.cwd(), "ArcRift-settings.json");

let cachedSettings: Settings | null = null;

export function getSettings(): Settings {
  if (cachedSettings) return cachedSettings;
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, "utf-8");
      cachedSettings = JSON.parse(data);
      logger.info(`[ArcRift] Settings loaded from ${SETTINGS_PATH}`);
    } else {
      cachedSettings = {};
    }
  } catch (err: any) {
    logger.error(`[ArcRift] Failed to read settings file: ${err.message}`);
    cachedSettings = {};
  }
  return cachedSettings!;
}

export function updateSettings(settings: Partial<Settings>): Settings {
  const current = getSettings();
  const updated = { ...current, ...settings };
  cachedSettings = updated;
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2), "utf-8");
    logger.success(`[ArcRift] Settings updated at ${SETTINGS_PATH}`);
  } catch (err: any) {
    logger.error(`[ArcRift] Failed to write settings file: ${err.message}`);
  }
  return updated;
}
