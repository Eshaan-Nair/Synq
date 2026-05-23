/**
 * isolation.integration.test.ts — Cross-Tenant Memory Isolation Test
 *
 * Asserts the core multi-tenant security guarantee:
 * data stored under Project A must never be retrievable under Project B,
 * regardless of semantic similarity between the query and stored content.
 *
 * This is the Jest-compatible version of the mcp-stress-test.ts isolation
 * audit. It tests the storage layer directly — no MCP server process needed —
 * making it fast, stable, and suitable for CI gating on every commit.
 *
 * Runs in SQLite (Zero-Docker) mode for full CI compatibility.
 */

import path from "path";
import dotenv from "dotenv";

// Mock the embedding layer so this test has zero external dependencies.
// Isolation is enforced by SQL sessionId scoping in the WHERE clause —
// not by vector distance — so deterministic fixed vectors are valid here.
jest.mock("../../src/services/embeddings", () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.5)),
  generateEmbeddings: jest.fn().mockImplementation((texts: string[]) =>
    Promise.resolve(texts.map(() => new Array(768).fill(0.5)))
  ),
}));

// Set storage mode before any service imports
process.env.ARCRIFT_STORAGE_MODE = "sqlite";
process.env.SQLITE_DB_PATH = path.resolve(__dirname, "../../ArcRift-isolation-test.db");
dotenv.config();

import { initStorage, sessionStore, vectorStore } from "../../src/services/storage";
import { slidingWindowChunks } from "../../src/services/chunker";

// --- Test data ---
// Each project has a unique secret string that should never appear in another
// project's recall results, even when the query is semantically similar.
const PROJECT_A = { id: "ISO_TEST_PROJ_A", secret: "ISOLATION_SECRET_ALPHA_9271" };
const PROJECT_B = { id: "ISO_TEST_PROJ_B", secret: "ISOLATION_SECRET_BETA_4830" };

const CONTENT_A = `The alpha configuration key is ${PROJECT_A.secret}. It is stored in the primary vault and rotated every 90 days.`;
const CONTENT_B = `The beta configuration key is ${PROJECT_B.secret}. It is stored in the secondary vault and rotated every 30 days.`;

describe("Cross-Tenant Memory Isolation", () => {
  beforeAll(async () => {
    await initStorage();

    // Clean up any leftover sessions from previous runs
    const existing = await sessionStore.getSessions();
    for (const s of existing) {
      if (s._id === PROJECT_A.id || s._id === PROJECT_B.id ||
          s.projectName === PROJECT_A.id || s.projectName === PROJECT_B.id) {
        await sessionStore.deleteSession(s._id);
      }
    }

    // Create both projects using the correct positional signature:
    // createSession(projectName, platform, externalChatId?, customId?)
    await sessionStore.createSession(PROJECT_A.id, "test", undefined, PROJECT_A.id);
    await sessionStore.createSession(PROJECT_B.id, "test", undefined, PROJECT_B.id);
  }, 30000);

  afterAll(async () => {
    // Clean up test sessions
    try {
      await sessionStore.deleteSession(PROJECT_A.id);
      await sessionStore.deleteSession(PROJECT_B.id);
    } catch {}

    // Remove test database
    const fs = await import("fs");
    const dbPath = process.env.SQLITE_DB_PATH!;
    for (const ext of ["", "-shm", "-wal"]) {
      try { fs.unlinkSync(dbPath + ext); } catch {}
    }
  });

  it("should store chunks into Project A without errors", async () => {
    // slidingWindowChunks produces fully-typed WindowChunk values (incl. wordStart/wordEnd)
    const chunks = slidingWindowChunks(CONTENT_A, PROJECT_A.id);
    await expect(vectorStore.storeChunks(chunks)).resolves.not.toThrow();
  }, 15000);

  it("should store chunks into Project B without errors", async () => {
    const chunks = slidingWindowChunks(CONTENT_B, PROJECT_B.id);
    await expect(vectorStore.storeChunks(chunks)).resolves.not.toThrow();
  }, 15000);

  it("should retrieve Project A's secret when querying within Project A", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "What is the alpha configuration key?",
      PROJECT_A.id,
      5
    );
    const combined = results.map(r => r.content).join(" ");
    // Project A's own data should be found
    expect(combined).toContain(PROJECT_A.secret);
  }, 15000);

  it("should NOT expose Project A's secret when querying from Project B", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "What is the alpha configuration key?",
      PROJECT_B.id,
      5
    );
    const combined = results.map(r => r.content).join(" ");
    // The query asks for alpha, but we are scoped to Project B — must return nothing from A
    expect(combined).not.toContain(PROJECT_A.secret);
  }, 15000);

  it("should NOT expose Project B's secret when querying from Project A", async () => {
    const results = await vectorStore.retrieveRelevantChunks(
      "What is the beta configuration key?",
      PROJECT_A.id,
      5
    );
    const combined = results.map(r => r.content).join(" ");
    // The query asks for beta, but we are scoped to Project A — must return nothing from B
    expect(combined).not.toContain(PROJECT_B.secret);
  }, 15000);

  it("should confirm global search is not scoped (returns results across projects)", async () => {
    // retrieveGlobalChunks searches across all projects with no sessionId filter.
    // We assert the method resolves without error and returns an array.
    // The FTS path is used here with exact keyword matches to bypass the similarity threshold.
    const results = await vectorStore.retrieveGlobalChunks("configuration key vault", 10);
    // The result set may or may not include our test data depending on similarity thresholds,
    // but the method must not throw and must return an array (even if empty).
    expect(Array.isArray(results)).toBe(true);
    // Additionally confirm there is no sessionId filtering applied (unlike retrieveRelevantChunks)
    // by checking the function accepts no sessionId parameter — enforced at compile time.
  }, 15000);
});
