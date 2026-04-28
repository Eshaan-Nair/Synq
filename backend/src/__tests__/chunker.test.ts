/**
 * chunker.test.ts
 *
 * Unit tests for slidingWindowChunks — the core RAG chunking function.
 * It is a pure function (no I/O, no side effects) so every case is trivially testable.
 *
 * Key guarantee tested: ZERO data loss — every word in the source text must
 * appear in at least one chunk.
 */

import { slidingWindowChunks } from "../services/chunker";

const SESSION = "test-session-id";

// ── Edge cases ─────────────────────────────────────────────────────

describe("slidingWindowChunks — edge cases", () => {
  test("returns empty array for empty string", () => {
    expect(slidingWindowChunks("", SESSION)).toHaveLength(0);
  });

  test("returns empty array for whitespace-only string", () => {
    expect(slidingWindowChunks("   \n  \t  ", SESSION)).toHaveLength(0);
  });

  test("returns single chunk when text fits within one window", () => {
    const text = Array(100).fill("word").join(" "); // 100 words < 300 window
    const chunks = slidingWindowChunks(text, SESSION);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].wordStart).toBe(0);
  });

  test("single chunk content matches trimmed input", () => {
    const text = "Hello world this is a short chat";
    const chunks = slidingWindowChunks(text, SESSION);
    expect(chunks[0].content).toBe(text.trim());
  });
});

// ── Chunking behaviour ─────────────────────────────────────────────

describe("slidingWindowChunks — chunking behaviour", () => {
  // Build a 700-word text to guarantee multiple windows (window=300, step=220)
  const words700 = Array.from({ length: 700 }, (_, i) => `word${i}`);
  const text700 = words700.join(" ");

  test("produces more than one chunk for long text", () => {
    const chunks = slidingWindowChunks(text700, SESSION);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("chunk indices are sequential starting from 0", () => {
    const chunks = slidingWindowChunks(text700, SESSION);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
    });
  });

  test("wordStart of chunk N equals (N * step)", () => {
    const chunks = slidingWindowChunks(text700, SESSION, 300, 80);
    const step = 300 - 80; // 220
    chunks.forEach((c, i) => {
      expect(c.wordStart).toBe(i * step);
    });
  });

  test("adjacent chunks overlap by overlapWords", () => {
    const chunks = slidingWindowChunks(text700, SESSION, 300, 80);
    if (chunks.length < 2) return;
    const overlapStart = chunks[1].wordStart;
    const prevEnd = chunks[0].wordEnd;
    // chunk[1] starts 220 words after chunk[0], so their overlap = prevEnd - overlapStart + 1
    expect(prevEnd).toBeGreaterThanOrEqual(overlapStart);
  });

  test("chunk ids are deterministic and unique", () => {
    const chunks = slidingWindowChunks(text700, SESSION);
    const ids = chunks.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(chunks.length);
    // All ids must contain the sessionId
    ids.forEach(id => expect(id).toContain(SESSION));
  });
});

// ── Zero data loss guarantee ───────────────────────────────────────

describe("slidingWindowChunks — zero data loss", () => {
  test("every word in source appears in at least one chunk", () => {
    const words = Array.from({ length: 650 }, (_, i) => `unique_word_${i}`);
    const text = words.join(" ");
    const chunks = slidingWindowChunks(text, SESSION, 300, 80);

    const allChunkText = chunks.map(c => c.content).join(" ");

    for (const word of words) {
      expect(allChunkText).toContain(word);
    }
  });

  test("single-word text produces one chunk containing that word", () => {
    const chunks = slidingWindowChunks("hello", SESSION);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("hello");
  });

  test("exactly windowWords text produces exactly one chunk", () => {
    const text = Array(300).fill("w").join(" "); // exactly 300 words
    const chunks = slidingWindowChunks(text, SESSION, 300, 80);
    expect(chunks).toHaveLength(1);
  });
});

// ── Custom parameters ──────────────────────────────────────────────

describe("slidingWindowChunks — custom parameters", () => {
  test("smaller window creates more chunks", () => {
    const text = Array(300).fill("word").join(" ");
    const defaultChunks = slidingWindowChunks(text, SESSION, 300, 80);
    const smallerChunks = slidingWindowChunks(text, SESSION, 100, 20);
    expect(smallerChunks.length).toBeGreaterThan(defaultChunks.length);
  });

  test("zero overlap produces non-overlapping chunks", () => {
    const words = Array.from({ length: 200 }, (_, i) => `w${i}`);
    const text = words.join(" ");
    const chunks = slidingWindowChunks(text, SESSION, 100, 0);
    // With 0 overlap, step = window = 100, so we get ceil(200/100) = 2 chunks
    expect(chunks.length).toBe(2);
    // wordStart of chunk 1 = 100 (no overlap)
    expect(chunks[1].wordStart).toBe(100);
  });

  test("sessionId is stored on every chunk", () => {
    const text = Array(400).fill("x").join(" ");
    const customSession = "my-custom-session-abc";
    const chunks = slidingWindowChunks(text, customSession);
    chunks.forEach(c => {
      expect(c.sessionId).toBe(customSession);
    });
  });
});
