import { sessionStore, graphStore, vectorStore } from "../../services/storage";
import { scrubPII } from "../../utils/privacy";
import { slidingWindowChunks } from "../../services/chunker";
import { extractTriples } from "../../services/extractor";

export async function storeMemory(
  projectId: string,
  text: string
): Promise<string> {
  try {
    const session = await sessionStore.getSession(projectId);
    if (!session) {
      return `Error: Project ${projectId} not found.`;
    }

    const cleanText = scrubPII(text);
    
    // 1. Store Chunks for RAG
    const windowChunks = slidingWindowChunks(cleanText, projectId);
    await vectorStore.storeChunks(windowChunks);

    // 2. Extract and Store Triples for Graph
    const { triples } = await extractTriples(cleanText);
    for (const t of triples) {
      await graphStore.saveTriple({
        ...t,
        sessionId: projectId,
        timestamp: new Date().toISOString()
      });
    }

    // 3. Update Session Stats
    await sessionStore.updateSession(projectId, {
      tripleCount: (session.tripleCount || 0) + triples.length,
      updatedAt: new Date()
    });

    return `Successfully stored memory in project "${session.projectName}".\n- Chunks stored: ${windowChunks.length}\n- Facts extracted: ${triples.length}`;
  } catch (err: any) {
    return `store_memory failed: ${err.message}`;
  }
}
