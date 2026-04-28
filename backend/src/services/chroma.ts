/**
 * chroma.ts — ChromaDB v2 REST API (v1.2)
 *
 * Updated: TopicChunk -> WindowChunk to match the new sliding window chunker.
 * Deduplication in retrieve now uses chunkIndex instead of topicName.
 */

import axios from "axios";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import { logger } from "../utils/logger";
import type { WindowChunk } from "./chunker";

const COLLECTION_NAME = "synq_chunks_v2";
const CHROMA_URL = (process.env.CHROMA_URL || "http://localhost:8000").replace(/\/$/, "");
const TENANT   = "default_tenant";
const DATABASE = "default_database";
const COLL_BASE = `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}/collections`;

// Cosine similarity threshold — values are in [0, 1]
// nomic-embed-text with cosine: 0.5+ is a good match, 0.3+ is loosely related
const SIMILARITY_THRESHOLD = 0.30;

// Collection UUID assigned by server on creation
let collectionId: string | null = null;

// ── Connect ────────────────────────────────────────────────────────
export async function connectChroma(): Promise<void> {
  try {
    const res = await axios.post(COLL_BASE, {
      name: COLLECTION_NAME,
      get_or_create: true,
      // Use cosine similarity — works correctly with nomic-embed-text's 768-dim vectors
      // L2 distance gives values of 200-450 on these vectors, making exp(-dist) always ~0
      metadata: { "hnsw:space": "cosine" },
    }, { timeout: 10000 });
    collectionId = res.data.id;
    logger.success(`ChromaDB connected — collection "${COLLECTION_NAME}" (${collectionId})`);
  } catch (err: any) {
    logger.error("ChromaDB connection failed:", err?.response?.data?.message || err?.message);
    logger.warn("RAG features will be unavailable. Is ChromaDB running?");
    collectionId = null;
  }
}

// ── Store Window Chunks ────────────────────────────────────────────
export async function storeWindowChunks(chunks: WindowChunk[]): Promise<void> {
  if (!collectionId) {
    logger.warn("ChromaDB not connected — skipping vector storage");
    return;
  }
  if (chunks.length === 0) return;

  // Purge ALL existing vectors for this session before storing new ones.
  // The previous approach only deleted chunk IDs matching the NEW set — if the
  // conversation shrank and produced fewer chunks, the old extra vectors
  // remained and polluted RAG retrieval. Full purge ensures a clean re-save.
  if (chunks[0]?.sessionId) {
    await deleteChunksBySession(chunks[0].sessionId);
  }

  // Embed chunks in parallel
  const embeddings = await generateEmbeddings(chunks.map(c => c.content));

  await axios.post(`${COLL_BASE}/${collectionId}/add`, {
    ids:        chunks.map(c => c.id),
    embeddings,
    documents:  chunks.map(c => c.content),
    metadatas:  chunks.map(c => ({
      sessionId:  c.sessionId,
      chunkIndex: c.chunkIndex,
      wordStart:  c.wordStart,
      wordEnd:    c.wordEnd,
    })),
  }, { timeout: 10000 });

  logger.success(`Stored ${chunks.length} window chunks in ChromaDB`);
}

// ── Retrieve ───────────────────────────────────────────────────────
export interface RetrievedChunk {
  chunkIndex: number;
  content: string;
  score: number;
}

export async function retrieveRelevantChunks(
  query: string,
  sessionId: string,
  topN = 3,
): Promise<RetrievedChunk[]> {
  if (!collectionId) {
    logger.warn("ChromaDB not connected — returning empty context");
    return [];
  }

  const queryEmbedding = await generateEmbedding(query);
  const fetchN = Math.max(topN * 4, 10); // over-fetch then filter

  const results = await axios.post(`${COLL_BASE}/${collectionId}/query`, {
    query_embeddings: [queryEmbedding],
    n_results:        Math.min(fetchN, 100), // ChromaDB caps at collection size
    where:            { sessionId },
    include:          ["documents", "distances", "metadatas"],
  }, { timeout: 10000 });

  const docs:      string[] = results.data.documents?.[0]  || [];
  const distances: number[] = results.data.distances?.[0]  || [];
  const metadatas: any[]    = results.data.metadatas?.[0]  || [];

  if (docs.length === 0) return [];

  // Cosine similarity: ChromaDB returns values in [0, 1] (1 = identical)
  // No conversion needed — score IS the cosine similarity directly
  const scored = docs.map((doc, i) => ({
    chunkIndex: (metadatas[i]?.chunkIndex as number) ?? i,
    content:    doc,
    score:      1 - (distances[i] ?? 1), // cosine distance → similarity
  }));

  // Filter by threshold, deduplicate (keep best score per chunk), sort by score
  const filtered = scored.filter(r => r.score >= SIMILARITY_THRESHOLD);
  const seen = new Map<number, RetrievedChunk>();
  for (const chunk of filtered) {
    const prev = seen.get(chunk.chunkIndex);
    if (!prev || chunk.score > prev.score) seen.set(chunk.chunkIndex, chunk);
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ── Delete by session ──────────────────────────────────────────────
export async function deleteChunksBySession(sessionId: string): Promise<void> {
  if (!collectionId) return;
  try {
    const res = await axios.post(`${COLL_BASE}/${collectionId}/get`, {
      where:   { sessionId },
      include: [],
    }, { timeout: 10000 });
    if (res.data?.ids?.length > 0) {
      await axios.post(`${COLL_BASE}/${collectionId}/delete`, { ids: res.data.ids }, { timeout: 10000 });
      logger.info(`Deleted ${res.data.ids.length} chunks for session ${sessionId}`);
    }
  } catch (err) {
    logger.warn("Could not delete chunks from ChromaDB:", err);
  }
}

// Keep backward-compat export name so any existing import of storeTopicChunks still compiles
export { storeWindowChunks as storeTopicChunks };