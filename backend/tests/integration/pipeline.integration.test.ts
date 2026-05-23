/**
 * pipeline.integration.test.ts — Full RAG Pipeline Integration Test
 *
 * Tests the complete save → chunk → embed → store → retrieve → inject chain.
 * Runs against real containerised ChromaDB (see .github/workflows/integration-tests.yml).
 *
 * Run locally: npm test -- --testPathPattern=pipeline.integration
 *
 * Prerequisites:
 *   - ChromaDB running on port 8000 (docker compose up -d chromadb)
 *   - Ollama running with nomic-embed-text pulled
 *   - MongoDB running on port 27017
 */

import path from "path";
process.env.ARCRIFT_STORAGE_MODE = process.env.ARCRIFT_STORAGE_MODE || "sqlite";
if (process.env.ARCRIFT_STORAGE_MODE === "sqlite") {
  process.env.SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(__dirname, "../../ArcRift-pipeline-test.db");
}

import { initStorage, sessionStore, vectorStore } from "../../src/services/storage";
import { slidingWindowChunks } from "../../src/services/chunker";

// Known fixture — deterministic test data
const FIXTURE_TEXT = `
We decided to use JWT with 15-minute access tokens for the authentication system.
The refresh token bug was caused by a missing httpOnly flag on the cookie,
which allowed XSS to steal tokens. We fixed this by setting httpOnly and Secure flags.
The session is stored in Redis with a 7-day TTL.
`;

const TEST_PROJECT  = "ArcRift-pipeline-test";
const TEST_SESSION  = `test-session-${Date.now()}`;

let testSessionId: string;

beforeAll(async () => {
  // Connect to unified storage
  await initStorage();

  // Create a test session
  const session = await sessionStore.createSession(TEST_PROJECT, "claude");
  testSessionId = session._id.toString();

  // Seed the known fixture using sliding window chunker
  const chunks = slidingWindowChunks(FIXTURE_TEXT, testSessionId);
  await vectorStore.storeChunks(chunks);

  // Allow embeddings to settle
  await new Promise(r => setTimeout(r, 2000));
}, 30_000);

afterAll(async () => {
  // Clean up test session
  try {
    await sessionStore.deleteSession(testSessionId);
  } catch {}

  // Clean up SQLite test db if we created one
  if (process.env.ARCRIFT_STORAGE_MODE === "sqlite") {
    const fs = await import("fs");
    const dbPath = process.env.SQLITE_DB_PATH!;
    for (const ext of ["", "-shm", "-wal"]) {
      try { fs.unlinkSync(dbPath + ext); } catch {}
    }
  }
});

describe("Full RAG Pipeline", () => {
  it("retrieves relevant chunk for semantically related query", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "JWT refresh token security issue",
      testSessionId,
      3
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0.5);
    expect(results[0].content.toLowerCase()).toMatch(/refresh|jwt|token/);
  }, 15_000);

  it("unrelated query scores below threshold", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "how to bake sourdough bread with a natural starter",
      testSessionId,
      3
    );
    // Unrelated queries should not yield high scores (> 0.45)
    const highScores = results.filter(r => r.score > 0.45);
    expect(highScores.length).toBe(0);
  }, 15_000);

  it("chunk count is non-zero after embedding fixture", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "authentication session storage",
      testSessionId,
      6
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it("retrieves httpOnly flag fix from related query", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "cookie security XSS prevention",
      testSessionId,
      3
    );
    expect(results.length).toBeGreaterThan(0);
    // Should mention the fix
    const allContent = results.map(r => r.content).join(" ").toLowerCase();
    expect(allContent).toMatch(/httponly|cookie|xss|flag/);
  }, 15_000);
});
