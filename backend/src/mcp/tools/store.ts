/**
 * mcp/tools/store.ts — store_memory tool
 * 
 * Manually save a new fact or context block into a project.
 */

import { sessionStore, graphStore, vectorStore } from "../../services/storage";
import { extractTriples } from "../../services/extractor";
import { slidingWindowChunks } from "../../services/chunker";

export async function store(
  content: string,
  project: string
): Promise<string> {
  try {
    const projectStr = String(project);
    const session = await sessionStore.getSession(projectStr);

    if (!session) {
      return `Synq project ID "${projectStr}" not found. Use list_projects to see valid IDs.`;
    }

    // 1. Graph Extraction
    const { triples } = await extractTriples(content);
    for (const t of triples) {
      await graphStore.saveTriple({
        ...t,
        sessionId: projectStr,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Vector Storage
    const chunks = slidingWindowChunks(content, projectStr);
    await vectorStore.storeChunks(chunks);

    // 3. Update Stats
    await sessionStore.updateSession(projectStr, {
      tripleCount: (session.tripleCount || 0) + triples.length,
      topicCount: (session.topicCount || 0) + chunks.length,
      updatedAt: new Date().toISOString()
    });

    return `Successfully stored memory in project "${session.projectName}".\n- Triples extracted: ${triples.length}\n- Vector chunks saved: ${chunks.length}`;
  } catch (err: any) {
    return `store_memory failed: ${err.message ?? String(err)}`;
  }
}
