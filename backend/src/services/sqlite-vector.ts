import { getSqlite } from "./sqlite";
import { IVectorStore, RetrievedChunk } from "./storage.types";
import { WindowChunk } from "./chunker";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import { logger } from "../utils/logger";
import { generateHyDEAnswer } from "./hyde";

// sqlite-vec returns raw L2 Euclidean distance (range ~10–30 for 768-dim nomic-embed-text).
// Convert to 0–1 similarity with exponential decay: exp(-distance/20)
// With search_query prefixes, scores move up: distance=8 → 0.67, distance=12 → 0.55
const l2ToScore = (distance: number) => Math.exp(-distance / 20);

const SESSION_THRESHOLD = 0.45;
const SENTENCE_THRESHOLD = 0.60; // Higher threshold for precision matches
const GLOBAL_THRESHOLD = 0.45;

/**
 * Splits text into sentences while preserving meaningful punctuation.
 */
function splitIntoSentences(text: string): string[] {
  // Relaxed to 5 chars to catch short code snippets or short facts
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length >= 5);
}

/**
 * Local 'Sentence Trimmer' (Option D)
 * Splits a retrieved chunk into sentences and returns only those that share
 * keywords with the user prompt. 
 */
function getRelevantSentences(content: string, prompt: string, limit = 5): string {
  const sentences = splitIntoSentences(content);
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
  public db = getSqlite();
  public generateEmbeddings = generateEmbeddings;

  async storeChunks(chunks: WindowChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const sessionId = chunks[0].sessionId;
    await this.deleteChunksBySession(sessionId);

    const contents = chunks.map(c => c.content);
    // nomic-embed-text: Use 'document' task for indexing
    const embeddings = await generateEmbeddings(contents, "document");

    const insertVec = this.db.prepare("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)");
    const insertMeta = this.db.prepare("INSERT INTO chunk_metadata (chunk_id, sessionId, chunkIndex, content) VALUES (?, ?, ?, ?)");
    const insertFts = this.db.prepare("INSERT INTO fts_chunks (chunk_id, content) VALUES (?, ?)");
    const insertSentVec = this.db.prepare("INSERT INTO vec_sentences (sentence_id, embedding) VALUES (?, ?)");
    const insertSentMeta = this.db.prepare("INSERT INTO sentence_metadata (sentence_id, chunk_id, content) VALUES (?, ?, ?)");

    const chunkEmbeddings = await generateEmbeddings(chunks.map(c => c.content), "document");

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = chunkEmbeddings[i];
      const vector = Buffer.from(new Float32Array(embedding).buffer);

      this.db.transaction(() => {
        insertVec.run(chunk.id, vector);
        insertMeta.run(chunk.id, chunk.sessionId, chunk.chunkIndex, chunk.content);
        insertFts.run(chunk.id, chunk.content);
      })();
    }

    // Offload high-precision sentence indexing to background job
    // This makes the "Save" instant (only 1-2 embeddings instead of 20)
    import("./jobs").then(m => m.enqueueJob("sentence_indexing", { chunks }));

    logger.success(`Stored ${chunks.length} chunks (Sentence indexing queued in background)`);
  }

  async retrieveRelevantChunks(query: string, sessionId: string, topN = 3, keywords: string[] = []): Promise<RetrievedChunk[]> {
    const hydeAnswer = await generateHyDEAnswer(query);
    const augmentedQuery = `${query}\n${hydeAnswer}`;

    const queryEmbedding = await generateEmbedding(augmentedQuery, "query");
    const vector = Buffer.from(new Float32Array(queryEmbedding).buffer);

    // 1. High-Precision Sentence Search (Small-to-Big)
    const sentRows = this.db.prepare(`
      SELECT 
        sm.chunk_id, sm.content, vs.distance
      FROM vec_sentences vs
      JOIN sentence_metadata sm ON vs.sentence_id = sm.sentence_id
      JOIN chunk_metadata m ON sm.chunk_id = m.chunk_id
      WHERE vs.embedding MATCH ? AND m.sessionId = ? AND k = 100
    `).all(vector, sessionId) as any[];

    // 2. Coarse Chunk Search (Context)
    const vecRows = this.db.prepare(`
      SELECT m.chunk_id, m.content, m.chunkIndex, v.distance
      FROM vec_chunks v
      JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
      WHERE v.embedding MATCH ? AND m.sessionId = ? AND k = 20
    `).all(vector, sessionId) as any[];

    // 3. Keyword Search
    const ftsQuery = query.replace(/[^\w\s]/g, " ").trim();
    if (!ftsQuery) return []; // Avoid empty FTS match

    const ftsRows = this.db.prepare(`
      SELECT m.chunk_id, m.chunkIndex, m.content
      FROM fts_chunks f
      JOIN chunk_metadata m ON f.chunk_id = m.chunk_id
      WHERE f.content MATCH ? AND m.sessionId = ?
      LIMIT 20
    `).all(ftsQuery, sessionId) as any[];

    // 4. Group & Filter
    // We group by chunk_id and only keep the sentences that matched.
    const candidates = new Map<string, { chunkIndex: number, sentences: Set<string>, maxScore: number }>();

    sentRows.forEach(r => {
      const score = l2ToScore(r.distance);
      if (score < SENTENCE_THRESHOLD) return;

      if (!candidates.has(r.chunk_id)) {
        candidates.set(r.chunk_id, { chunkIndex: 0, sentences: new Set(), maxScore: score });
      }
      candidates.get(r.chunk_id)!.sentences.add(r.content);
      candidates.get(r.chunk_id)!.maxScore = Math.max(candidates.get(r.chunk_id)!.maxScore, score);
    });

    // Backfill chunk metadata for sentence candidates
    vecRows.forEach(r => {
      if (candidates.has(r.chunk_id)) {
        candidates.get(r.chunk_id)!.chunkIndex = r.chunkIndex;
        candidates.get(r.chunk_id)!.maxScore = Math.max(candidates.get(r.chunk_id)!.maxScore, l2ToScore(r.distance));
      } else {
        const score = l2ToScore(r.distance);
        if (score >= SESSION_THRESHOLD) {
          candidates.set(r.chunk_id, { chunkIndex: r.chunkIndex, sentences: new Set(), maxScore: score });
        }
      }
    });

    ftsRows.forEach(r => {
      if (!candidates.has(r.chunk_id)) {
        candidates.set(r.chunk_id, { chunkIndex: r.chunkIndex, sentences: new Set(), maxScore: SESSION_THRESHOLD });
      }
    });

    return Array.from(candidates.values())
      .map(c => {
        // Fallback: If no high-precision sentences matched but chunk score is high, 
        // inject the first few sentences of the chunk to avoid "zero context".
        let finalContent = "";
        if (c.sentences.size > 0) {
          finalContent = Array.from(c.sentences).join(" ");
        } else if (c.maxScore >= SESSION_THRESHOLD) {
          // Find the chunk content to use as fallback
          const chunkId = Array.from(candidates.keys()).find(id => candidates.get(id) === c);
          const row = this.db.prepare("SELECT content FROM chunk_metadata WHERE chunk_id = ?").get(chunkId) as { content: string } | undefined;
          const rawContent = row?.content || "";
          const allSentences = splitIntoSentences(rawContent);
          finalContent = allSentences.slice(0, 3).join(" ");
        }

        return {
          content: finalContent,
          chunkIndex: c.chunkIndex,
          score: c.maxScore
        };
      })
      .filter(r => r.score >= SESSION_THRESHOLD && r.content.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  async retrieveGlobalChunks(query: string, topN = 3, keywords: string[] = []): Promise<RetrievedChunk[]> {
    const hydeAnswer = await generateHyDEAnswer(query);
    const augmentedQuery = `${query}\n${hydeAnswer}`;
    const queryEmbedding = await generateEmbedding(augmentedQuery, "query");
    const vector = Buffer.from(new Float32Array(queryEmbedding).buffer);

    const sentRows = this.db.prepare(`
      SELECT sm.chunk_id, sm.content, vs.distance
      FROM vec_sentences vs
      JOIN sentence_metadata sm ON vs.sentence_id = sm.sentence_id
      WHERE vs.embedding MATCH ? AND k = 100
    `).all(vector) as any[];

    const candidates = new Map<string, { chunkIndex: number, sentences: Set<string>, maxScore: number }>();

    sentRows.forEach(r => {
      const score = l2ToScore(r.distance);
      if (score < SENTENCE_THRESHOLD) return;
      if (!candidates.has(r.chunk_id)) {
        candidates.set(r.chunk_id, { chunkIndex: 0, sentences: new Set(), maxScore: score });
      }
      candidates.get(r.chunk_id)!.sentences.add(r.content);
    });

    return Array.from(candidates.values())
      .map(c => ({
        content: Array.from(c.sentences).join(" "),
        chunkIndex: c.chunkIndex,
        score: c.maxScore
      }))
      .filter(r => r.content.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  async deleteChunksBySession(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM chunk_metadata WHERE sessionId = ?").run(sessionId);
    this.db.prepare(`DELETE FROM vec_chunks WHERE chunk_id NOT IN (SELECT chunk_id FROM chunk_metadata)`).run();
    this.db.prepare(`DELETE FROM fts_chunks WHERE chunk_id NOT IN (SELECT chunk_id FROM chunk_metadata)`).run();
    this.db.prepare(`DELETE FROM vec_sentences WHERE sentence_id NOT IN (SELECT sentence_id FROM sentence_metadata)`).run();
    this.db.prepare(`DELETE FROM sentence_metadata WHERE chunk_id NOT IN (SELECT chunk_id FROM chunk_metadata)`).run();
  }
}
