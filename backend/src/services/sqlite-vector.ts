import { getSqlite } from "./sqlite";
import { IVectorStore, RetrievedChunk } from "./storage.types";
import { WindowChunk } from "./chunker";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import { logger } from "../utils/logger";

// sqlite-vec returns raw L2 Euclidean distance (range ~10–30 for 768-dim nomic-embed-text).
// Convert to 0–1 similarity with exponential decay: exp(-d/20)
// distance=12 → 0.55, distance=17 → 0.43, distance=24 → 0.30
const l2ToScore = (distance: number) => Math.exp(-distance / 20);

const SESSION_THRESHOLD = 0.30;  // Allowed history queries to pass Tier 1
const GLOBAL_THRESHOLD  = 0.30;  // Uniform sensitivity across both tiers

/**
 * Local 'Sentence Trimmer' (Option D)
 * Splits a retrieved chunk into sentences and returns only those that share
 * keywords with the user prompt. 
 */
function getRelevantSentences(content: string, prompt: string, limit = 5): string {
  const sentences = content.split(/(?<=[.!?])\s+/);
  const pLower = prompt.toLowerCase();
  const promptWords = pLower.split(/\W+/).filter(w => w.length > 3);
  
  // Detect "History Queries" (e.g., "what did we talk about")
  const isHistoryQuery = /\b(talk|chat|convo|discuss|last|previous|before|history|remember)\b/i.test(pLower);

  const scored = sentences.map(s => {
    const sLower = s.toLowerCase();
    let score = 0;
    for (const word of promptWords) {
      if (sLower.includes(word)) score++;
    }
    return { s, score };
  });

  const filtered = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.s);

  if (filtered.length > 0) return filtered.join(" ");

  // Fallback: Only allow first 3 sentences if it's a history-seeking query.
  // Otherwise, return empty (effectively filters out unrelated noise like slippers vs credit cards).
  return isHistoryQuery ? sentences.slice(0, 3).join(" ") : "";
}

export class SqliteVectorStore implements IVectorStore {
  private db = getSqlite();

  async storeChunks(chunks: WindowChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const sessionId = chunks[0].sessionId;
    await this.deleteChunksBySession(sessionId);

    const contents = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(contents);

    const insertVec = this.db.prepare("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)");
    const insertMeta = this.db.prepare("INSERT INTO chunk_metadata (chunk_id, sessionId, chunkIndex, content) VALUES (?, ?, ?, ?)");

    const transaction = this.db.transaction((items: { chunk: WindowChunk, embedding: number[] }[]) => {
      for (const item of items) {
        const vector = Buffer.from(new Float32Array(item.embedding).buffer);
        insertVec.run(item.chunk.id, vector);
        insertMeta.run(item.chunk.id, item.chunk.sessionId, item.chunk.chunkIndex, item.chunk.content);
      }
    });

    transaction(chunks.map((c, i) => ({ chunk: c, embedding: embeddings[i] })));
    logger.success(`Stored ${chunks.length} chunks in SQLite-vec`);
  }

  async retrieveRelevantChunks(query: string, sessionId: string, topN = 3, keywords: string[] = []): Promise<RetrievedChunk[]> {
    const queryEmbedding = await generateEmbedding(query);
    const vector = Buffer.from(new Float32Array(queryEmbedding).buffer);

    // sqlite-vec evaluates `k` BEFORE the JOIN/WHERE filters, so we must
    // fetch a large global pool first, then let the sessionId filter narrow it.
    // Using topN * 2 (=6) caused misses as the DB grew with multiple sessions.
    const K_POOL = 400;
    const rows = this.db.prepare(`
      SELECT 
        m.content,
        m.chunkIndex,
        v.distance,
        s.updatedAt,
        s.createdAt
      FROM vec_chunks v
      JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
      JOIN sessions s ON m.sessionId = s.id
      WHERE v.embedding MATCH ? 
        AND m.sessionId = ?
        AND k = ?
    `).all(vector, sessionId, K_POOL) as any[];

    return rows
      .map(row => {
        const semanticScore = l2ToScore(row.distance);
        const lastUpdate = new Date(row.updatedAt || row.createdAt || new Date()).getTime();
        const daysOld = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        const decayFactor = 1.0 - Math.min(0.3, (daysOld / 180) * 0.3);

        // Hybrid Boost: Each unique keyword match adds 10% to the score (max 1.5x)
        let keywordBoost = 1.0;
        if (keywords.length > 0) {
          const contentLower = row.content.toLowerCase();
          const matches = keywords.filter(k => contentLower.includes(k.toLowerCase())).length;
          keywordBoost = 1.0 + Math.min(0.5, matches * 0.1);
        }

        return {
          content: getRelevantSentences(row.content, query),
          chunkIndex: row.chunkIndex,
          score: semanticScore * decayFactor * keywordBoost
        };
      })
      .filter(r => r.score >= SESSION_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  async retrieveGlobalChunks(query: string, topN = 3, keywords: string[] = []): Promise<RetrievedChunk[]> {
    const queryEmbedding = await generateEmbedding(query);
    const vector = Buffer.from(new Float32Array(queryEmbedding).buffer);

    const K_POOL = 200; // Smaller pool for global (no session filter needed)
    const rows = this.db.prepare(`
      SELECT 
        m.content,
        m.chunkIndex,
        v.distance,
        s.updatedAt,
        s.createdAt
      FROM vec_chunks v
      JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
      JOIN sessions s ON m.sessionId = s.id
      WHERE v.embedding MATCH ? 
        AND k = ?
    `).all(vector, K_POOL) as any[];

    return rows
      .map(row => {
        const semanticScore = l2ToScore(row.distance);
        const lastUpdate = new Date(row.updatedAt || row.createdAt || new Date()).getTime();
        const daysOld = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        const decayFactor = 1.0 - Math.min(0.3, (daysOld / 180) * 0.3);

        // Hybrid Boost: Each unique keyword match adds 10% to the score (max 1.5x)
        let keywordBoost = 1.0;
        if (keywords.length > 0) {
          const contentLower = row.content.toLowerCase();
          const matches = keywords.filter(k => contentLower.includes(k.toLowerCase())).length;
          keywordBoost = 1.0 + Math.min(0.5, matches * 0.1);
        }

        return {
          content: getRelevantSentences(row.content, query),
          chunkIndex: row.chunkIndex,
          score: semanticScore * decayFactor * keywordBoost
        };
      })
      .filter(r => r.score >= GLOBAL_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  async deleteChunksBySession(sessionId: string): Promise<void> {
    // Cascading delete should handle vec_chunks if setup, but better safe
    this.db.prepare("DELETE FROM chunk_metadata WHERE sessionId = ?").run(sessionId);
    // Note: Since vec_chunks is a virtual table, it might not support cascading deletes 
    // from a regular table in all versions. We clean it up manually based on orphaned IDs.
    this.db.prepare(`
      DELETE FROM vec_chunks 
      WHERE chunk_id NOT IN (SELECT chunk_id FROM chunk_metadata)
    `).run();
  }
}
