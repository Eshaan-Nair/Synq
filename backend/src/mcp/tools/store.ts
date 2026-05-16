/**
 * mcp/tools/store.ts — store_memory tool
 * 
 * Manually save a new fact or context block into a project.
 */

import { sessionStore, graphStore, vectorStore } from "../../services/storage";
import { extractTriples } from "../../services/extractor";
import { slidingWindowChunks } from "../../services/chunker";
import { logger } from "../../utils/logger";

export async function store(
  content: string,
  project: string
): Promise<string> {
  try {
    const projectStr = String(project);
    let session = await sessionStore.getSession(projectStr);

    // Auto-create project if it doesn't exist
    if (!session) {
      // Try searching by name first to avoid duplicates
      session = await sessionStore.getSessionByName(projectStr);
      
      if (!session) {
        logger.info(`[GLIA MCP] Auto-creating project: "${projectStr}"`);
        session = await sessionStore.createSession(projectStr, "mcp", undefined, projectStr);
      }
    }

    const sessionId = session._id;
    logger.info(`[GLIA MCP] Using Session ID: "${sessionId}" for project: "${projectStr}"`);

    // 1. Save Full Chat (for Dashboard visualization)
    await sessionStore.saveFullChat(sessionId, content, 1, "mcp");

    // 2. Graph Extraction (with fallback)
    let triples: any[] = [];
    try {
      const result = await extractTriples(content);
      triples = result.triples;
      for (const t of triples) {
        await graphStore.saveTriple({
          ...t,
          sessionId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      // Continue even if graph extraction fails
    }

    // 3. Vector Storage (Batched)
    const chunks = slidingWindowChunks(content, sessionId, 150, 50);
    await vectorStore.storeChunks(chunks);

    // 4. Update Stats
    await sessionStore.updateSession(sessionId, {
      tripleCount: (session.tripleCount || 0) + triples.length,
      updatedAt: new Date()
    });

    return `Successfully stored memory in project "${session.projectName}" (${sessionId}).\n- Visible in Dashboard: Yes\n- Facts extracted: ${triples.length}\n- Context depth: ${chunks.length} chunks`;
  } catch (err: any) {
    return `store_memory failed: ${err.message ?? String(err)}`;
  }
}
