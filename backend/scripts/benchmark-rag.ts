import path from "path";
import fs from "fs";

// MUST set env BEFORE importing storage services
const BENCHMARK_DB = path.join(__dirname, "benchmark.db");
process.env.SQLITE_DB_PATH = BENCHMARK_DB;
if (fs.existsSync(BENCHMARK_DB)) fs.unlinkSync(BENCHMARK_DB);

import { initSqlite } from "../src/services/sqlite";
import { SqliteVectorStore } from "../src/services/sqlite-vector";
import { SqliteGraphStore } from "../src/services/sqlite-graph";
import { SqliteSessionStore } from "../src/services/sqlite-session";
import { logger } from "../src/utils/logger";

async function runBenchmark() {
  logger.info("🚀 Starting RAG Benchmark...");

  initSqlite();
  const vectorStore = new SqliteVectorStore();
  const graphStore = new SqliteGraphStore();
  const sessionStore = new SqliteSessionStore();

  const projectName = "BenchmarkProject";
  const session = await sessionStore.createSession(projectName, "mcp");
  const sessionId = session._id as string;

  // 1. Ingest Gold Standard Knowledge
  const documents = [
    { id: "chunk-1", content: "Glia uses better-sqlite3 and sqlite-vec for Zero-Docker local storage. This allows it to run without MongoDB or Neo4j." },
    { id: "chunk-2", content: "The Model Context Protocol (MCP) allows AI tools like Claude Code and Cursor to access Glia memory via stdio." },
    { id: "chunk-3", content: "Hybrid Search combines Vector embeddings with Knowledge Graph facts for improved recall accuracy." },
    { id: "chunk-4", content: "Privacy is a core pillar. All PII is redacted in the browser before being sent to the backend." }
  ];

  const facts = [
    { subject: "Glia", relation: "uses", object: "sqlite-vec" },
    { subject: "MCP", relation: "enables", object: "Claude Code" }
  ];

  logger.info("📥 Ingesting documents...");
  await vectorStore.storeChunks(documents.map((d, i) => ({
    id: `${sessionId}-bench-${i}`,
    sessionId,
    chunkIndex: i,
    content: d.content,
    wordStart: 0,
    wordEnd: d.content.split(" ").length
  })));

  const db = (initSqlite as any).db || (require("../src/services/sqlite").getSqlite());
  console.log("Metadata Count:", db.prepare("SELECT count(*) as count FROM chunk_metadata").get().count);
  console.log("Vector Count:", db.prepare("SELECT count(*) as count FROM vec_chunks").get().count);

  const storedSession = db.prepare("SELECT id FROM sessions LIMIT 1").get();
  const storedMeta = db.prepare("SELECT sessionId FROM chunk_metadata LIMIT 1").get();
  console.log("Bench SessionID:", sessionId);
  console.log("Stored Session ID:", storedSession?.id);
  console.log("Stored Meta SessionID:", storedMeta?.sessionId);

  // Add some graph facts
  for (const f of facts) {
    await graphStore.saveTriple({
      subject: f.subject,
      subjectType: "Entity",
      relation: f.relation,
      object: f.object,
      objectType: "Entity",
      sessionId,
      timestamp: new Date().toISOString()
    });
  }

  // 2. Define Queries and Expected Results
  const queries = [
    { q: "What storage does Glia use for local mode?", expectedId: 0 }, // Should match chunk-1
    { q: "How do AI tools connect to Glia?", expectedId: 1 },         // Should match chunk-2
    { q: "Tell me about search accuracy improvements", expectedId: 2 }, // Should match chunk-3
    { q: "How is data privacy handled?", expectedId: 3 }             // Should match chunk-4
  ];

  // 3. Run Benchmark
  let hits = 0;
  let totalReciprocalRank = 0;

  logger.info(`🔍 Running ${queries.length} queries...`);

  for (const query of queries) {
    const results = await vectorStore.retrieveRelevantChunks(query.q, sessionId, 3);
    const topResult = results[0];

    if (topResult && topResult.chunkIndex === query.expectedId) {
      hits++;
    }

    const rank = results.findIndex(r => r.chunkIndex === query.expectedId) + 1;
    if (rank > 0) {
      totalReciprocalRank += (1 / rank);
    }

    logger.info(`Query: "${query.q}"`);
    logger.info(`  Top Match: ${topResult ? `Index ${topResult.chunkIndex} (Score: ${topResult.score.toFixed(4)})` : "NONE"}`);
    if (topResult) logger.info(`  Content: ${topResult.content.slice(0, 50)}...`);
  }

  const hitRate = (hits / queries.length) * 100;
  const mrr = totalReciprocalRank / queries.length;

  console.log("\n" + "=".repeat(40));
  console.log("BENCHMARK RESULTS (v1.4.7)");
  console.log("=".repeat(40));
  console.log(`Hit Rate @ 1:  ${hitRate.toFixed(2)}%`);
  console.log(`MRR:           ${mrr.toFixed(4)}`);
  console.log("=".repeat(40) + "\n");

  // Cleanup
  const dbPath = process.env.SQLITE_DB_PATH;
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
