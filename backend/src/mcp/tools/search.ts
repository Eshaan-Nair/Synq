import { vectorStore } from "../../services/storage";
import { sanitizeChunks } from "../../middleware/sanitize";

export async function searchMemory(
  query: string,
  topN: number = 5
): Promise<string> {
  try {
    const rawChunks = await vectorStore.retrieveGlobalChunks(query, topN);
    
    if (rawChunks.length === 0) {
      return `No results found across all projects for: "${query}"`;
    }

    const safeChunks = sanitizeChunks(rawChunks);
    const lines = safeChunks.map((c, i) =>
      `[${i + 1}] relevance=${(c.score * 100).toFixed(0)}%\n${c.content}`
    );

    return `Search results for "${query}" (top ${safeChunks.length}):\n\n${lines.join("\n\n---\n\n")}`;
  } catch (err: any) {
    return `search_memory failed: ${err.message}`;
  }
}
