/**
 * integration-test.ts — Full MCP System Test
 * 
 * Exercises all MCP tools from start to end to verify 
 * Hybrid Search, Smart Detection, and Dashboard Integration.
 */

import path from "path";
import dotenv from "dotenv";

// Setup environment for Zero-Docker mode
process.env.GLIA_STORAGE_MODE = "sqlite";
process.env.SQLITE_DB_PATH = path.resolve(__dirname, "../../glia.db");
dotenv.config();

// Imports after env setup
import { initStorage, sessionStore } from "../services/storage";
import { identifyProject } from "./tools/detector";
import { listProjects } from "./tools/projects";
import { store } from "./tools/store";
import { recall } from "./tools/recall";
import { search } from "./tools/search";
import { getSummary } from "./tools/summary";

async function runThoroughTest() {
  console.log("🚀 STARTING FULL MCP SYSTEM TEST\n");

  // 0. Initialize
  await initStorage();
  console.log("✅ Storage Initialized");

  // 1. Test Project Detection
  console.log("\n--- [1] Project Detection ---");
  const testPath = "C:/Code/Glia-Test-Project";
  const detectionResult = await identifyProject(testPath);
  console.log(`Input Path: ${testPath}`);
  console.log(`Result: ${detectionResult}`);

  // 2. Test List Projects
  console.log("\n--- [2] List Projects ---");
  const projectList = await listProjects();
  console.log(projectList);

  // Get a real session for further testing
  const sessions = await sessionStore.getSessions();
  if (sessions.length === 0) {
    console.log("❌ No sessions found. Cannot proceed with tool tests.");
    return;
  }
  const targetProject = sessions[0];
  const targetId = targetProject._id;

  // 3. Test Store Memory (Dashboard Integration + Extraction)
  console.log(`\n--- [3] Store Memory (Project: ${targetProject.projectName}) ---`);
  const testFact = "The Glia project uses a Hybrid Search engine combining SQLite-vec and custom Graph logic.";
  const storeResult = await store(testFact, targetId);
  console.log(storeResult);

  // 4. Test Hybrid Recall (Project-specific)
  console.log("\n--- [4] Hybrid Recall (Should find 'Hybrid Search') ---");
  const recallResult = await recall("How does search work?", targetId);
  console.log(recallResult);

  // 5. Test Global Hybrid Search
  console.log("\n--- [5] Global Hybrid Search ---");
  const globalSearchResult = await search("Glia search engine");
  console.log(globalSearchResult);

  // 6. Test Resource Summary
  console.log("\n--- [6] Project Summary (Resource) ---");
  const summaryResult = await getSummary(targetId);
  console.log(`Summary length: ${summaryResult.length} chars`);
  console.log("Snippet:");
  console.log(summaryResult.slice(0, 300) + "...");

  console.log("\n✨ MCP SYSTEM TEST COMPLETE");
}

runThoroughTest().catch(err => {
  console.error("\n❌ TEST FAILED:");
  console.error(err);
  process.exit(1);
});
