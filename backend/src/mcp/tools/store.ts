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
      return `Glia project ID "${projectStr}" not found. Use list_projects to see valid IDs.`;
    }

    // 1. Save Full Chat (for Dashboard visualization)
    await sessionStore.saveFullChat(projectStr, content, 1, "mcp");

    // 2. Graph Extraction (with fallback)
    let triples: any[] = [];
    try {
      const result = await extractTriples(content);
      triples = result.triples;
      for (const t of triples) {
        await graphStore.saveTriple({
          ...t,
          sessionId: projectStr,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      // Extraction failed, continue with vector storage
    }

    // 3. Vector Storage
    const chunks = slidingWindowChunks(content, projectStr);
    await vectorStore.storeChunks(chunks);

    // 4. Update Stats
    await sessionStore.updateSession(projectStr, {
      tripleCount: (session.tripleCount || 0) + triples.length,
      topicCount: (session.topicCount || 0) + chunks.length,
      hasFullChat: true,
      updatedAt: new Date()
    });

    return `Successfully stored memory in project "${session.projectName}".\n- Visible in Dashboard: Yes\n- Triples extracted: ${triples.length}\n- Vector chunks saved: ${chunks.length}`;
  } catch (err: any) {
    return `store_memory failed: ${err.message ?? String(err)}`;
  }
}
