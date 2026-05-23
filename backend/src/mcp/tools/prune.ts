/**
 * mcp/tools/prune.ts — prune_memory tool
 * 
 * Surgically remove facts and context chunks from a project.
 */

import { sessionStore, graphStore, vectorStore } from "../../services/storage";
import { extractTriples } from "../../services/extractor";
import { logger } from "../../utils/logger";

export async function prune(
  prompt: string,
  project: string
): Promise<string> {
  try {
    const sessionId = String(project);
    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      return `Project "${sessionId}" not found.`;
    }

    logger.info(`[ArcRift MCP] Pruning memory in project "${session.projectName}" for: "${prompt}"`);

    // 1. Identify entities to prune using extraction logic on the prompt
    // This helps us find the "Nouns" the user wants to forget.
    let entitiesToPrune: string[] = [];
    try {
      const { triples } = await extractTriples(prompt);
      entitiesToPrune = Array.from(new Set(triples.flatMap(t => [t.subject, t.object])));
    } catch (err) {
      // Fallback: use simple word split if LLM extraction fails
      entitiesToPrune = prompt.split(/\s+/).filter(w => w.length > 4);
    }

    if (entitiesToPrune.length === 0) {
      return "Could not identify specific entities to prune. Please be more specific.";
    }

    // 2. Wipe from Knowledge Graph
    const factsDeleted = await graphStore.deleteTriples(entitiesToPrune, sessionId);

    // 3. Wipe from Vector Store (Semantic)
    const chunksDeleted = await vectorStore.deleteChunksByQuery(prompt, sessionId);

    // 4. Update Session Stats
    await sessionStore.updateSession(sessionId, {
      tripleCount: Math.max(0, (session.tripleCount || 0) - factsDeleted),
      updatedAt: new Date()
    });

    return `Successfully pruned memory for "${prompt}":\n` +
           `- Facts removed from Graph: ${factsDeleted}\n` +
           `- Semantic chunks destroyed: ${chunksDeleted}\n` +
           `- Targeted entities: ${entitiesToPrune.join(", ")}`;

  } catch (err: any) {
    logger.error(`[ArcRift MCP] Pruning failed: ${err.message}`);
    return `prune_memory failed: ${err.message ?? String(err)}`;
  }
}
