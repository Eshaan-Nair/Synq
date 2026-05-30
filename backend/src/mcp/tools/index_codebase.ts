/**
 * mcp/tools/index_codebase.ts
 * 
 * Scans a local directory and chunks code files into the vector database.
 */

import { sessionStore } from "../../services/storage";
import { indexCodebase as indexer } from "../../services/indexer";
import { logger } from "../../utils/logger";
import path from "path";
import fs from "fs";

export async function indexCodebase(
  directoryPath: string,
  sessionId?: string
): Promise<string> {
  try {
    let targetId = sessionId;

    if (!targetId) {
      targetId = await sessionStore.getActiveSessionId() ?? undefined;
    }

    if (!targetId) {
      return "Error: No active session. Call identify_active_project first or provide a sessionId.";
    }

    const absPath = path.resolve(directoryPath);
    if (!fs.existsSync(absPath)) {
      return `Error: Directory does not exist at path: ${absPath}`;
    }

    const stats = fs.statSync(absPath);
    if (!stats.isDirectory()) {
      return `Error: Path is not a directory: ${absPath}`;
    }

    const { filesScanned, filesSkipped } = await indexer(absPath, targetId);

    return `Successfully indexed codebase at ${absPath}. Scanned and chunked ${filesScanned} files. Skipped ${filesSkipped} files (ignored or binary).`;
  } catch (err: any) {
    logger.error("index_codebase failed:", err);
    return `Error indexing codebase: ${err.message ?? String(err)}`;
  }
}
