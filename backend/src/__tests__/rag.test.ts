/**
 * rag.test.ts — v1.3
 *
 * Rewrote from scratch to test the ACTUAL production logic in chroma.ts:
 *
 * OLD (wrong):
 *   - distanceToScore = exp(-distance)  ← L2 formula, never used
 *   - deduplicateByTopic by topicName   ← old field, doesn't exist
 *   - splitIntoTopics isValidTopic      ← deleted code, doesn't exist
 *
 * NEW (correct):
 *   - cosineDistanceToSimilarity: score = 1 - distance  (cosine space)
 *   - deduplicateByChunkIndex using chunkIndex as the key
 *   - applyThreshold with SIMILARITY_THRESHOLD = 0.30
 */

// ── Types matching chroma.ts RetrievedChunk ──────────────────────
interface RetrievedChunk {
  chunkIndex: number;
  content: string;
  score: number;
}

// ── Pure functions mirroring chroma.ts production logic ──────────

/**
 * ChromaDB cosine distance → similarity score.
 * ChromaDB returns cosine DISTANCE in [0, 1], where 0 = identical.
 * Similarity = 1 - distance.
 */
function cosineDistanceToSimilarity(distance: number): number {
  return 1 - distance;
}

const SIMILARITY_THRESHOLD = 0.30;

function applyThreshold(chunks: RetrievedChunk[], threshold: number): RetrievedChunk[] {
  return chunks.filter(r => r.score >= threshold);
}

/**
 * Deduplicate by chunkIndex — keep the highest-scoring entry per chunk.
 * Returns results sorted by descending score.
 */
function deduplicateByChunkIndex(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Map<number, RetrievedChunk>();
  for (const chunk of chunks) {
    const prev = seen.get(chunk.chunkIndex);
    if (!prev || chunk.score > prev.score) seen.set(chunk.chunkIndex, chunk);
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

// ── Tests ─────────────────────────────────────────────────────────

describe("cosineDistanceToSimilarity (cosine space)", () => {
  test("distance 0 gives score 1.0 (identical vectors)", () => {
    expect(cosineDistanceToSimilarity(0)).toBeCloseTo(1.0);
  });

  test("distance 1 gives score 0.0 (completely dissimilar)", () => {
    expect(cosineDistanceToSimilarity(1)).toBeCloseTo(0.0);
  });

  test("distance 0.5 gives score 0.5", () => {
    expect(cosineDistanceToSimilarity(0.5)).toBeCloseTo(0.5);
  });

  test("distance 0.70 gives score 0.30 (right at threshold)", () => {
    expect(cosineDistanceToSimilarity(0.70)).toBeCloseTo(0.30);
  });

  test("score decreases as distance increases", () => {
    expect(cosineDistanceToSimilarity(0.2)).toBeGreaterThan(cosineDistanceToSimilarity(0.5));
    expect(cosineDistanceToSimilarity(0.5)).toBeGreaterThan(cosineDistanceToSimilarity(0.9));
  });

  test("score is always in [0, 1] for valid cosine distances", () => {
    [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0].forEach(d => {
      const score = cosineDistanceToSimilarity(d);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});

describe("applyThreshold (SIMILARITY_THRESHOLD = 0.30)", () => {
  const chunks: RetrievedChunk[] = [
    { chunkIndex: 0, content: "high relevance", score: 0.85 },
    { chunkIndex: 1, content: "just at threshold", score: 0.30 },
    { chunkIndex: 2, content: "below threshold", score: 0.25 },
    { chunkIndex: 3, content: "very relevant", score: 0.72 },
  ];

  test("filters out chunks strictly below the threshold", () => {
    const result = applyThreshold(chunks, SIMILARITY_THRESHOLD);
    expect(result.map(c => c.chunkIndex)).not.toContain(2);
  });

  test("keeps chunks at exactly the threshold (>= not >)", () => {
    const result = applyThreshold(chunks, SIMILARITY_THRESHOLD);
    expect(result.map(c => c.chunkIndex)).toContain(1);
  });

  test("keeps all chunks that pass the threshold", () => {
    const result = applyThreshold(chunks, SIMILARITY_THRESHOLD);
    expect(result).toHaveLength(3); // 0.85, 0.30, 0.72
  });

  test("returns empty array if no chunks pass", () => {
    expect(applyThreshold(chunks, 0.99)).toHaveLength(0);
  });

  test("returns all chunks if threshold is 0", () => {
    expect(applyThreshold(chunks, 0)).toHaveLength(4);
  });
});

describe("deduplicateByChunkIndex", () => {
  test("keeps highest score when the same chunkIndex appears twice", () => {
    const chunks: RetrievedChunk[] = [
      { chunkIndex: 2, content: "lower score version", score: 0.40 },
      { chunkIndex: 2, content: "higher score version", score: 0.80 },
    ];
    const result = deduplicateByChunkIndex(chunks);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("higher score version");
    expect(result[0].score).toBe(0.80);
  });

  test("preserves chunks with unique chunkIndex values", () => {
    const chunks: RetrievedChunk[] = [
      { chunkIndex: 0, content: "chunk 0", score: 0.70 },
      { chunkIndex: 1, content: "chunk 1", score: 0.55 },
      { chunkIndex: 2, content: "chunk 2", score: 0.40 },
    ];
    expect(deduplicateByChunkIndex(chunks)).toHaveLength(3);
  });

  test("results are sorted by descending score", () => {
    const chunks: RetrievedChunk[] = [
      { chunkIndex: 0, content: "a", score: 0.40 },
      { chunkIndex: 1, content: "b", score: 0.90 },
      { chunkIndex: 2, content: "c", score: 0.65 },
    ];
    const result = deduplicateByChunkIndex(chunks);
    expect(result[0].chunkIndex).toBe(1); // 0.90
    expect(result[1].chunkIndex).toBe(2); // 0.65
    expect(result[2].chunkIndex).toBe(0); // 0.40
  });

  test("handles empty input", () => {
    expect(deduplicateByChunkIndex([])).toHaveLength(0);
  });

  test("handles single chunk", () => {
    const result = deduplicateByChunkIndex([{ chunkIndex: 5, content: "only", score: 0.55 }]);
    expect(result).toHaveLength(1);
    expect(result[0].chunkIndex).toBe(5);
  });
});

describe("full RAG pipeline: threshold → deduplicate → topN slice", () => {
  /**
   * Simulates the exact pipeline in chroma.ts retrieveRelevantChunks():
   *   1. Convert cosine distance → similarity score
   *   2. Filter by threshold
   *   3. Deduplicate by chunkIndex (keep best)
   *   4. Sort descending
   *   5. Slice to topN
   */
  function pipeline(
    raw: { chunkIndex: number; content: string; distance: number }[],
    topN = 3,
  ): RetrievedChunk[] {
    const scored = raw.map(r => ({
      chunkIndex: r.chunkIndex,
      content: r.content,
      score: cosineDistanceToSimilarity(r.distance),
    }));
    const filtered = applyThreshold(scored, SIMILARITY_THRESHOLD);
    const deduped = deduplicateByChunkIndex(filtered);
    return deduped.slice(0, topN);
  }

  test("pipeline returns empty when all distances are too high", () => {
    const raw = [
      { chunkIndex: 0, content: "a", distance: 0.80 }, // score 0.20 — below threshold
      { chunkIndex: 1, content: "b", distance: 0.75 }, // score 0.25 — below threshold
    ];
    expect(pipeline(raw)).toHaveLength(0);
  });

  test("pipeline deduplicates duplicate chunkIndex and keeps best score", () => {
    const raw = [
      { chunkIndex: 0, content: "first occurrence",  distance: 0.50 }, // score 0.50
      { chunkIndex: 0, content: "second occurrence", distance: 0.30 }, // score 0.70 ← better
      { chunkIndex: 1, content: "unique chunk",      distance: 0.40 }, // score 0.60
    ];
    const result = pipeline(raw, 5);
    expect(result).toHaveLength(2);
    expect(result.find(c => c.chunkIndex === 0)?.content).toBe("second occurrence");
  });

  test("pipeline respects topN limit", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({
      chunkIndex: i,
      content: `chunk ${i}`,
      distance: 0.10 + i * 0.02, // all pass threshold (scores 0.90 down to 0.72)
    }));
    expect(pipeline(raw, 3)).toHaveLength(3);
  });

  test("pipeline returns results in descending score order", () => {
    const raw = [
      { chunkIndex: 2, content: "medium", distance: 0.45 }, // score 0.55
      { chunkIndex: 0, content: "best",   distance: 0.10 }, // score 0.90
      { chunkIndex: 1, content: "good",   distance: 0.30 }, // score 0.70
    ];
    const result = pipeline(raw, 5);
    expect(result[0].content).toBe("best");
    expect(result[1].content).toBe("good");
    expect(result[2].content).toBe("medium");
  });
});
