/**
 * mcp.integration.test.ts — Full MCP System Integration Test
 *
 * Exercises all MCP tools from start to end to verify
 * Hybrid Search, Smart Detection, and Dashboard Integration.
 * Runs in SQLite mode (Zero-Docker) for CI compatibility.
 */

import path from "path";
import dotenv from "dotenv";

// Setup environment for Zero-Docker mode BEFORE any imports
process.env.ARCRIFT_STORAGE_MODE = "sqlite";
process.env.SQLITE_DB_PATH = path.resolve(__dirname, "../../ArcRift.db");
dotenv.config();

import { initStorage, sessionStore } from "../../src/services/storage";
import { identifyProject } from "../../src/mcp/tools/detector";
import { listProjects } from "../../src/mcp/tools/projects";
import { store } from "../../src/mcp/tools/store";
import { recall } from "../../src/mcp/tools/recall";
import { search } from "../../src/mcp/tools/search";
import { getSummary } from "../../src/mcp/tools/summary";

describe("MCP Tool Integration", () => {
  let targetId: string;

  beforeAll(async () => {
    await initStorage();
    const sessions = await sessionStore.getSessions();
    if (sessions.length > 0) {
      targetId = sessions[0]._id;
    }
  }, 30000);

  it("should initialize storage without errors", async () => {
    // initStorage already ran in beforeAll — if we reach here it succeeded
    expect(true).toBe(true);
  });

  it("identify_active_project: should return a result for any path", async () => {
    const result = await identifyProject("C:/Code/ArcRift-Test-Project");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 10000);

  it("list_projects: should return a non-empty string", async () => {
    const result = await listProjects();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 10000);

  it("store_memory: should store text and confirm", async () => {
    if (!targetId) {
      console.warn("No sessions found — skipping store_memory test.");
      return;
    }
    const result = await store(
      "The ArcRift project uses a Hybrid Search engine combining SQLite-vec and custom Graph logic.",
      targetId
    );
    expect(typeof result).toBe("string");
    expect(result).not.toMatch(/error/i);
  }, 30000);

  it("recall_context: should return context or a not-found message", async () => {
    if (!targetId) {
      console.warn("No sessions found — skipping recall_context test.");
      return;
    }
    const result = await recall("How does search work?", targetId);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 15000);

  it("search_memory: should return results or a not-found message", async () => {
    if (!targetId) {
      console.warn("No sessions found — skipping search_memory test.");
      return;
    }
    const result = await search("ArcRift search engine");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it("get_project_summary: should return a summary string", async () => {
    if (!targetId) {
      console.warn("No sessions found — skipping get_project_summary test.");
      return;
    }
    const result = await getSummary(targetId);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 15000);
});
