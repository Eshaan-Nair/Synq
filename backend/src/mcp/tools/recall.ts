import { vectorStore } from "../../services/storage";
import { sanitizeChunks, wrapInContextBlock } from "../../middleware/sanitize";

export async function recallContext(
  projectId: string,
  query: string,
  topN: number = 5
): Promise<string> {
  try {
    const rawChunks = await vectorStore.retrieveRelevantChunks(query, projectId, topN);
    
    if (rawChunks.length === 0) {
      return `No relevant memory found in project ${projectId} for query: "${query}"`;
    }

    const safeChunks = sanitizeChunks(rawChunks);
    const context = wrapInContextBlock(safeChunks);

    return context;
  } catch (err: any) {
    return `recall_context failed: ${err.message}`;
  }
}
