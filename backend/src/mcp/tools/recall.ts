/**
 * mcp/tools/recall.ts — recall_context tool
 * 
 * Targeted semantic search within a specific session.
 */

import { vectorStore, sessionStore } from "../../services/storage";
import { sanitizeChunks } from "../../middleware/sanitize";

export async function recall(
  query: string,
  project: string,
  topN: number = 3
): Promise<string> {
  try {
    const projectStr = String(project);
    const session = await sessionStore.getSession(projectStr);
    
    if (!session) {
      return `Synq project ID "${projectStr}" not found. Use list_projects to see valid IDs.`;
    }

    const chunks = await vectorStore.retrieveRelevantChunks(query, projectStr, topN);

    if (chunks.length === 0) {
      return `No relevant memory found for "${query}" in project "${session.projectName}".`;
    }

    const safe = sanitizeChunks(chunks);
    const context = safe.map((c, i) => `[${i + 1}] (Relevance: ${(c.score * 100).toFixed(0)}%)\n${c.content}`).join("\n\n---\n\n");

    return `Recalled memory for "${query}" in project "${session.projectName}":\n\n${context}`;
  } catch (err: any) {
    return `recall_context failed: ${err.message ?? String(err)}`;
  }
}
