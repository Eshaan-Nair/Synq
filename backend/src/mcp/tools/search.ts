/**
 * mcp/tools/search.ts — search_memory tool
 * 
 * Semantic search across ALL sessions and projects.
 */

import { vectorStore } from "../../services/storage";
import { sanitizeChunks } from "../../middleware/sanitize";

export async function search(
  query: string,
  topN: number = 5
): Promise<string> {
  try {
    const clampedN = Math.max(1, Math.min(topN, 10));
    const chunks = await vectorStore.retrieveGlobalChunks(query, clampedN);

    if (chunks.length === 0) {
      return `No results found for: "${query}". Try different keywords or list_projects to browse.`;
    }

    const safe = sanitizeChunks(chunks);
    const lines = safe.map((c, i) => 
      `[${i + 1}] relevance=${(c.score * 100).toFixed(0)}% | session="${(c as any).sessionId || 'unknown'}"\n${c.content}`
    );

    return `Search results for "${query}" (top ${chunks.length}):\n\n${lines.join("\n\n---\n\n")}`;
  } catch (err: any) {
    return `search_memory failed: ${err.message ?? String(err)}`;
  }
}
