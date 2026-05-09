/**
 * mcp/tools/recall.ts — recall_context tool
 * 
 * Targeted semantic search within a specific session.
 */

import { vectorStore, sessionStore, graphStore } from "../../services/storage";
import { extractEntitiesFromQuery } from "../../services/extractor";
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

    // 1. Graph Enrichment (Extract entities -> find related triples)
    let relatedTriples: any[] = [];
    try {
      const entities = await extractEntitiesFromQuery(query);
      if (entities.length > 0) {
        relatedTriples = await graphStore.findRelatedTriples(entities, projectStr);
      }
    } catch (err) {
      // Fallback: extraction failed, continue with vector only
    }

    // 2. Vector Retrieval
    const chunks = await vectorStore.retrieveRelevantChunks(query, projectStr, topN);

    if (chunks.length === 0 && relatedTriples.length === 0) {
      return `No relevant memory found for "${query}" in project "${session.projectName}".`;
    }

    const safe = sanitizeChunks(chunks);
    
    let response = `Recalled memory for "${query}" in project "${session.projectName}":\n\n`;

    if (relatedTriples.length > 0) {
      response += `STRUCTURED FACTS:\n`;
      response += relatedTriples.map(t => `- ${t.subject} ${t.relation} ${t.object}`).join("\n");
      response += `\n\n`;
    }

    if (safe.length > 0) {
      response += `RELEVANT CONTEXT CHUNKS:\n`;
      response += safe.map((c, i) => `[${i + 1}] (Relevance: ${(c.score * 100).toFixed(0)}%)\n${c.content}`).join("\n\n---\n\n");
    }

    return response;
  } catch (err: any) {
    return `recall_context failed: ${err.message ?? String(err)}`;
  }
}
