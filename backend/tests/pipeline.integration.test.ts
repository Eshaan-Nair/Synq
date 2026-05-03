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

// Helpers — import from actual service files
import { storeWindowChunks, retrieveRelevantChunks } from "../src/services/chroma";
import { slidingWindowChunks } from "../src/services/chunker";
import { connectChroma } from "../src/services/chroma";
import { connectMongo } from "../src/services/mongo";
import { Session } from "../src/services/mongo";
import mongoose from "mongoose";

// Known fixture — deterministic test data
const FIXTURE_TEXT = `
We decided to use JWT with 15-minute access tokens for the authentication system.
The refresh token bug was caused by a missing httpOnly flag on the cookie,
which allowed XSS to steal tokens. We fixed this by setting httpOnly and Secure flags.
The session is stored in Redis with a 7-day TTL.
`;

const TEST_PROJECT  = "synq-pipeline-test";
const TEST_SESSION  = `test-session-${Date.now()}`;

let testSessionId: string;

beforeAll(async () => {
  // Connect to real services
  await connectMongo();
  await connectChroma();

  // Create a test session
  const session = await Session.create({
    projectName: TEST_PROJECT,
    platform: "test",
  });
  testSessionId = session._id.toString();

  // Seed the known fixture using sliding window chunker
  const chunks = slidingWindowChunks(FIXTURE_TEXT, testSessionId);
  await storeWindowChunks(chunks);

  // Allow embeddings to settle
  await new Promise(r => setTimeout(r, 2000));
}, 30_000);

afterAll(async () => {
  // Clean up test session
  await Session.findByIdAndDelete(testSessionId);
  await mongoose.disconnect();
});

describe("Full RAG Pipeline", () => {
  it("retrieves relevant chunk for semantically related query", async () => {
    const results = await retrieveRelevantChunks(
      "JWT refresh token security issue",
      testSessionId,
      3
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0.4);
    expect(results[0].content.toLowerCase()).toMatch(/refresh|jwt|token/);
  }, 15_000);

  it("unrelated query scores below threshold", async () => {
    const results = await retrieveRelevantChunks(
      "pandas dataframe pivot table machine learning",
      testSessionId,
      3
    );
    // All results should be low relevance
    const highScores = results.filter(r => r.score > 0.30);
    expect(highScores.length).toBe(0);
  }, 15_000);

  it("chunk count is non-zero after embedding fixture", async () => {
    const results = await retrieveRelevantChunks(
      "authentication session storage",
      testSessionId,
      6
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it("retrieves httpOnly flag fix from related query", async () => {
    const results = await retrieveRelevantChunks(
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
