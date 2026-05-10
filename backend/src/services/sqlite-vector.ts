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
        const vector = Buffer.from(new Float32Array(item.embedding).buffer);
        insertVec.run(item.chunk.id, vector);
        insertMeta.run(item.chunk.id, item.chunk.sessionId, item.chunk.chunkIndex, item.chunk.content);
      }
    });

    transaction(chunks.map((c, i) => ({ chunk: c, embedding: embeddings[i] })));
    logger.success(`Stored ${chunks.length} chunks in SQLite-vec`);
  }

  async retrieveRelevantChunks(query: string, sessionId: string, topN = 3): Promise<RetrievedChunk[]> {
    const queryEmbedding = await generateEmbedding(query);
    const vector = Buffer.from(new Float32Array(queryEmbedding).buffer);

    // v1.4.5: Full query with Session ID filtering and Time-based Decay
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
    `).all(vector, sessionId, topN * 2) as any[];

    return rows
      .map(row => {
        const semanticScore = 1.0 - row.distance;
        const lastUpdate = new Date(row.updatedAt || row.createdAt || new Date()).getTime();
        const daysOld = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        const decayFactor = 1.0 - Math.min(0.3, (daysOld / 180) * 0.3);

        return {
          content: row.content,
          chunkIndex: row.chunkIndex,
          score: semanticScore * decayFactor
        };
      })
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
        v.distance,
        s.updatedAt,
        s.createdAt
      FROM vec_chunks v
      JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
      JOIN sessions s ON m.sessionId = s.id
      WHERE v.embedding MATCH ? 
        AND k = ?
    `).all(vector, topN * 2) as any[];

    return rows
      .map(row => {
        const semanticScore = 1.0 - row.distance;
        const lastUpdate = new Date(row.updatedAt || row.createdAt || new Date()).getTime();
        const daysOld = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        const decayFactor = 1.0 - Math.min(0.3, (daysOld / 180) * 0.3);

        return {
          content: row.content,
          chunkIndex: row.chunkIndex,
          score: semanticScore * decayFactor
        };
      })
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
