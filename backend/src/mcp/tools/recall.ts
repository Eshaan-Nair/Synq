/**
 * mcp/tools/recall.ts — recall_context tool
 *
 * Retrieves the most relevant memory chunks from ChromaDB for a given prompt,
 * optionally scoped to a project. Returns sanitised, XML-wrapped context block.
 */

import { retrieveRelevantChunks } from "../../services/chroma";
import { Session } from "../../services/mongo";
import { wrapInContextBlock, sanitizeChunks } from "../../middleware/sanitize";

export async function recall(
  prompt: string,
  project?: string,
  topN: number = 3
): Promise<string> {
  try {
    const clampedN = Math.max(1, Math.min(topN, 6));

    // Find the session for the given project (most recent)
    let sessionId: string | undefined;
    if (project) {
      const session = await Session.findOne({ projectName: project })
        .sort({ updatedAt: -1 })
        .select("_id");
      sessionId = session?._id?.toString();
    }

    if (!sessionId) {
      return project
        ? `No session found for project "${project}". Save a conversation first.`
        : "No project specified and no active session. Pass a project name.";
    }

    const rawChunks = await retrieveRelevantChunks(prompt, sessionId, clampedN);

    if (rawChunks.length === 0) {
      return `No relevant memory found for prompt: "${prompt.slice(0, 80)}..."`;
    }

    const MAX_CHARS = 2000;
    const cappedChunks = rawChunks.map(c => ({
      ...c,
      content: c.content.length > MAX_CHARS
        ? c.content.slice(0, MAX_CHARS) + "\n… (truncated)"
        : c.content,
    }));

    return wrapInContextBlock(sanitizeChunks(cappedChunks));
  } catch (err: any) {
    return `recall_context failed: ${err.message ?? String(err)}`;
  }
}
