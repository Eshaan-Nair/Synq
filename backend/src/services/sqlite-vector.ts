import { getSqlite } from "./sqlite";
import { IVectorStore, RetrievedChunk } from "./storage.types";
import { WindowChunk } from "./chunker";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import { logger } from "../utils/logger";

const SIMILARITY_THRESHOLD = 0.55;

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
        // sqlite-vec expects a Float32Array or a Buffer for embeddings
        const vector = new Float32Array(item.embedding);
        insertVec.run(item.chunk.id, vector);
        insertMeta.run(item.chunk.id, item.chunk.sessionId, item.chunk.chunkIndex, item.chunk.content);
      }
    });

    transaction(chunks.map((c, i) => ({ chunk: c, embedding: embeddings[i] })));
    logger.success(`Stored ${chunks.length} chunks in SQLite-vec`);
  }

  async retrieveRelevantChunks(query: string, sessionId: string, topN = 3): Promise<RetrievedChunk[]> {
    const queryEmbedding = await generateEmbedding(query);
    const vector = new Float32Array(queryEmbedding);

    // sqlite-vec returns 'distance'. For cosine, similarity = 1 - distance? 
    // Wait, better-sqlite3 with sqlite-vec: 
    // SELECT ... FROM vec_chunks WHERE embedding MATCH ? AND k = ?
    const rows = this.db.prepare(`
      SELECT 
        m.content,
        m.chunkIndex,
        v.distance
      FROM vec_chunks v
      JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
      WHERE v.embedding MATCH ? 
        AND m.sessionId = ?
        AND k = ?
    `).all(vector, sessionId, topN * 2) as any[];

    return rows
      .map(row => ({
        content: row.content,
        chunkIndex: row.chunkIndex,
        score: 1 - row.distance // Approximate similarity
      }))
      .filter(r => r.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  async retrieveGlobalChunks(query: string, topN = 3): Promise<RetrievedChunk[]> {
    const queryEmbedding = await generateEmbedding(query);
    const vector = new Float32Array(queryEmbedding);

    const rows = this.db.prepare(`
      SELECT 
        m.content,
        m.chunkIndex,
        v.distance
      FROM vec_chunks v
      JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
      WHERE v.embedding MATCH ? 
        AND k = ?
    `).all(vector, topN * 2) as any[];

    return rows
      .map(row => ({
        content: row.content,
        chunkIndex: row.chunkIndex,
        score: 1 - row.distance
      }))
      .filter(r => r.score >= (SIMILARITY_THRESHOLD + 0.05))
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
