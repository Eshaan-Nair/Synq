"use strict";
/**
 * chunker.ts — Sliding Window Chunker (v1.2)
 *
 * Replaces the previous Groq-based topic splitter entirely.
 *
 * Why: The Groq topic splitter dropped personal facts ("my dog's name is Noob"),
 * rejected short content, and filtered "generic" topic names. This made RAG recall
 * unreliable for anything that wasn't explicitly technical.
 *
 * This implementation is a pure function — no API calls, no filtering, no information loss.
 * Every word in the raw chat ends up in at least one chunk. Overlapping windows ensure
 * that context spanning a chunk boundary is captured in both neighbours.
 *
 * The Groq pipeline (extractTriples -> Neo4j) is completely unchanged.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.slidingWindowChunks = slidingWindowChunks;
/**
 * Split text into overlapping word windows.
 *
 * @param text        Full raw chat text (already PII-scrubbed)
 * @param sessionId   MongoDB session ID — used to generate deterministic chunk IDs
 * @param windowWords Number of words per chunk (default 300 ≈ ~400 tokens)
 * @param overlapWords Words shared between adjacent chunks (default 80)
 */
function slidingWindowChunks(text, sessionId, windowWords = 300, overlapWords = 80) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return [];
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
    const chunks = [];
    const step = windowWords - overlapWords; // how far we advance each iteration
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
        // Stop if the remaining words are already covered by overlap of the last chunk
        if (i >= words.length)
            break;
    }
    return chunks;
}
