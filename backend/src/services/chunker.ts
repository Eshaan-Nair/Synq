/**
 * chunker.ts — Sliding Window Chunker (v1.3)
 *
 * Fix: Added guard against infinite loop when overlapWords >= windowWords.
 * If step would be <= 0, the function now clamps overlap to windowWords - 1.
 */

export interface WindowChunk {
  id: string;
  sessionId: string;
  content: string;
  chunkIndex: number;
  wordStart: number;
  wordEnd: number;
}

/**
 * Split text into overlapping word windows.
 *
 * @param text        Full raw chat text (already PII-scrubbed)
 * @param sessionId   MongoDB session ID — used to generate deterministic chunk IDs
 * @param windowWords Number of words per chunk (default 300 ≈ ~400 tokens)
 * @param overlapWords Words shared between adjacent chunks (default 80)
 */
export function slidingWindowChunks(
  text: string,
  sessionId: string,
  windowWords = 300,
  overlapWords = 80,
): WindowChunk[] {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) return [];

  // FIX (Issue #5): Guard against infinite loop if overlapWords >= windowWords.
  // Clamp overlap so step is always at least 1.
  const safeOverlap = Math.min(overlapWords, windowWords - 1);
  const step = windowWords - safeOverlap;

  // If the whole chat fits in one window, return it as a single chunk
  if (words.length <= windowWords) {
    return [{
      id: `${sessionId}-chunk-0`,
      sessionId,
      content: text.trim(),
      chunkIndex: 0,
      wordStart: 0,
      wordEnd: words.length - 1,
    }];
  }

  const chunks: WindowChunk[] = [];
  let i = 0;
  let chunkIndex = 0;

  while (i < words.length) {
    const slice = words.slice(i, i + windowWords);
    chunks.push({
      id: `${sessionId}-chunk-${chunkIndex}`,
      sessionId,
      content: slice.join(" "),
      chunkIndex,
      wordStart: i,
      wordEnd: Math.min(i + windowWords - 1, words.length - 1),
    });
    i += step;
    chunkIndex++;
    if (i >= words.length) break;
  }

  return chunks;
}