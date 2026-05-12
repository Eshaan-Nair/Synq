/**
 * sanitize.ts — Prompt Injection Defence Middleware
 *
 * Two protections:
 *   1. sanitizeChunks() — scans retrieved RAG chunks for known injection
 *      patterns and redacts them before they reach the AI's context window.
 *   2. wrapInContextBlock() — wraps all injected context in XML-style
 *      delimiters that most LLMs treat as data, not instructions.
 *
 * Updated: v1.4.6
 */

import { logger } from "../utils/logger";

export interface Chunk {
  content: string;
  score: number;
  chunkIndex: number;
  [key: string]: unknown;
}

// ── Known injection trigger phrases ───────────────────────────────
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /your\s+(new\s+)?instructions?\s+(are|is)/i,
  /disregard\s+(the\s+)?(above|previous|prior|context)/i,
  /system\s*prompt\s*:/i,
  /you\s+are\s+now\s+/i,
  /forget\s+everything/i,
  /new\s+persona\s*:/i,
  /act\s+as\s+if\s+you\s+are/i,
  /pretend\s+you\s+(are|have)/i,
  /override\s+(previous|all|above)\s+(instructions?|rules?|context)/i,
];

/**
 * Scan each chunk for injection patterns and redact matching chunks.
 * Returns a new array — does not mutate the input.
 */
export function sanitizeChunks(chunks: Chunk[]): Chunk[] {
  return chunks.map(chunk => {
    const flagged = INJECTION_PATTERNS.some(p => p.test(chunk.content));
    if (flagged) {
      logger.warn(
        `[GLIA sanitize] Injection pattern detected in chunk ${chunk.chunkIndex} — redacting.`
      );
      return {
        ...chunk,
        content: "[Content redacted: potential prompt injection pattern detected]",
      };
    }
    return chunk;
  });
}

/**
 * Join sanitised chunks into a clean text block.
 */
export function wrapInContextBlock(chunks: Chunk[]): string {
  if (chunks.length === 0) return "";

  return chunks.map(c => c.content).join("\n\n");
}
