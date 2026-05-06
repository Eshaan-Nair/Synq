/**
 * mcp/tools/search.ts — search_memory tool
 *
 * Semantic search across ALL sessions and projects.
 * Uses the same ChromaDB REST API that the backend uses (axios-based, no chromadb npm client).
 */

import axios from "axios";
import { generateEmbedding } from "../../services/embeddings";
import { sanitizeChunks } from "../../middleware/sanitize";

const CHROMA_URL     = (process.env.CHROMA_URL || "http://localhost:8000").replace(/\/$/, "");
const TENANT         = "default_tenant";
const DATABASE       = "default_database";
const COLLECTION_NAME = "synq_chunks_v2";

async function getCollectionId(): Promise<string | null> {
  try {
    const base = `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}/collections`;
    const res  = await axios.get(`${base}/${COLLECTION_NAME}`, { timeout: 5000 });
    return res.data?.id ?? null;
  } catch {
    return null;
  }
}

export async function search(
  query: string,
  topN: number = 5
): Promise<string> {
  try {
    const clampedN = Math.max(1, Math.min(topN, 10));

    const collectionId = await getCollectionId();
    if (!collectionId) {
      return `ChromaDB collection not found — no memory has been saved yet, or ChromaDB is not running.`;
    }

    const embedding = await generateEmbedding(query);
    const base      = `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}/collections`;

    const results = await axios.post(`${base}/${collectionId}/query`, {
      query_embeddings: [embedding],
      n_results:        clampedN,
      include:          ["documents", "distances", "metadatas"],
    }, { timeout: 10000 });

    const docs:      (string | null)[] = results.data.documents?.[0] ?? [];
    const distances: number[]          = results.data.distances?.[0]  ?? [];
    const metadatas: any[]             = results.data.metadatas?.[0]  ?? [];

    const SIMILARITY_THRESHOLD = 0.4;
    const chunks = docs
      .map((doc, i) => ({
        content:    doc ?? "",
        score:      Math.max(0, 1 - (distances[i] ?? 1)),
        chunkIndex: i,
        sessionId:  (metadatas[i] as any)?.sessionId ?? "unknown",
        project:    (metadatas[i] as any)?.projectName ?? "unknown",
      }))
      .filter(c => c.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (chunks.length === 0) {
      return `No results found for: "${query}" with sufficient similarity (threshold=${SIMILARITY_THRESHOLD}).`;
    }

    const safe  = sanitizeChunks(chunks);
    const lines = safe.map((c, i) =>
      `[${i + 1}] relevance=${(c.score * 100).toFixed(0)}% | session="${c.sessionId}" | project="${c.project}"\n${c.content}`
    );

    return `Search results for "${query}" (top ${chunks.length}):\n\n${lines.join("\n\n---\n\n")}`;
  } catch (err: any) {
    return `search_memory failed: ${err.message ?? String(err)}`;
  }
}
