/**
 * mcp/tools/store.ts — store_memory tool
 *
 * Saves text to SYNQ long-term memory:
 *   - ChromaDB: sliding-window vector chunks for semantic search
 *   - Neo4j:    knowledge graph triples
 *   - MongoDB:  session metadata
 */

import { slidingWindowChunks } from "../../services/chunker";
import { storeWindowChunks } from "../../services/chroma";
import { extractTriples } from "../../services/extractor";
import { saveTriple } from "../../services/neo4j";
import { Session } from "../../services/mongo";
import { scrubPII } from "../../utils/privacy";
import { logger } from "../../utils/logger";

export async function store(
  text: string,
  project: string = "mcp-default"
): Promise<string> {
  try {
    if (!text || text.trim().length < 10) {
      return "Text too short — must be at least 10 characters.";
    }

    // Find or create session for this project
    const projectStr = String(project); // v1.4.1: ensure string
    let session = await Session.findOne({ projectName: projectStr }).sort({ updatedAt: -1 });
    if (!session) {
      session = await Session.create({ projectName: projectStr, platform: "mcp" });
    }
    const sessionId = session._id.toString();

    // Scrub PII before storing
    const cleanText = scrubPII(text);

    // Chunk + embed into ChromaDB via sliding window chunker
    const windowChunks = slidingWindowChunks(cleanText, sessionId);
    let vectorsStored = false;
    try {
      await storeWindowChunks(windowChunks);
      vectorsStored = true;
    } catch (vecErr: any) {
      logger.warn(`MCP store: vector storage failed — ${vecErr?.message}`);
    }

    // Extract knowledge graph triples
    let triplesCount = 0;
    try {
      const triples = await extractTriples(cleanText);
      for (const t of triples) {
        await saveTriple(
          t.subject, t.subjectType,
          t.relation,
          t.object, t.objectType,
          sessionId
        );
      }
      triplesCount = triples.length;
    } catch (graphErr: any) {
      logger.warn(`MCP store: graph extraction failed — ${graphErr?.message}`);
    }

    // Update session metadata
    await Session.findByIdAndUpdate(sessionId, {
      updatedAt: new Date(),
      hasFullChat: true,
      topicCount: windowChunks.length,
      $inc: { tripleCount: triplesCount },
    });

    const warnings: string[] = [];
    if (!vectorsStored) warnings.push("RAG vectors not stored (Ollama may be down)");
    if (triplesCount === 0) warnings.push("No graph triples extracted");

    return (
      `✓ Stored in SYNQ memory for project "${project}":\n` +
      `  Chunks embedded: ${windowChunks.length}\n` +
      `  Graph triples:   ${triplesCount}\n` +
      `  Session ID:      ${sessionId}` +
      (warnings.length ? `\n  Warnings: ${warnings.join("; ")}` : "")
    );
  } catch (err: any) {
    return `store_memory failed: ${err.message ?? String(err)}`;
  }
}
