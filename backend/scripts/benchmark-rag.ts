
import * as dotenv from "dotenv";
import path from "path";
// Load .env from the backend root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { vectorStore } from "../src/services/storage";
import { logger } from "../src/utils/logger";
import { slidingWindowChunks } from "../src/services/chunker";
import { generateEmbeddings, generateEmbedding } from "../src/services/embeddings";
import { splitIntoSentences } from "../src/services/sqlite-vector";
import { getSqlite } from "../src/services/sqlite";

async function runBenchmark() {
  logger.info("========================================");
  logger.info(" GLIA-AI RAG BENCHMARK SUITE v1.5.0");
  logger.info("========================================");

  const db = getSqlite();
  const sessionId = "BENCH_V3_" + Date.now();
  
  db.prepare("INSERT INTO sessions (id, projectName, platform, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
    sessionId, "RAG Audit", "CLI", new Date().toISOString(), new Date().toISOString()
  );

  const needle = "The secret password for the Glia system is 'ANTIGRAVITY_99'. It is stored in the vault at the 5th floor.";
  const haystack = [
    "The weather in Tokyo is currently cloudy with a chance of rain later this afternoon.",
    "Quantum entanglement is a phenomenon where particles remain connected regardless of distance.",
    needle,
    "The Great Wall of China is a series of fortifications built across ancient borders."
  ].join("\n\n");

  logger.info(`[1/3] Ingesting Needle...`);
  const chunks = slidingWindowChunks(haystack, sessionId, 150, 50);
  
  const insertVec = db.prepare("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)");
  const insertMeta = db.prepare("INSERT INTO chunk_metadata (chunk_id, sessionId, chunkIndex, content) VALUES (?, ?, ?, ?)");
  const insertFts = db.prepare("INSERT INTO fts_chunks (chunk_id, content) VALUES (?, ?)");
  const insertSentVec = db.prepare("INSERT INTO vec_sentences (sentence_id, embedding) VALUES (?, ?)");
  const insertSentMeta = db.prepare("INSERT INTO sentence_metadata (sentence_id, chunk_id, content) VALUES (?, ?, ?)");

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk.content, "document");
    const vector = Buffer.from(new Float32Array(embedding).buffer);
    
    db.transaction(() => {
      insertVec.run(chunk.id, vector);
      insertMeta.run(chunk.id, sessionId, chunk.chunkIndex, chunk.content);
      insertFts.run(chunk.id, chunk.content);
    })();

    const sentences = splitIntoSentences(chunk.content);
    for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
      const sId = `${chunk.id}-s-${sIdx}`;
      const sEmbed = await generateEmbedding(sentences[sIdx], "document");
      const sVec = Buffer.from(new Float32Array(sEmbed).buffer);
      insertSentVec.run(sId, sVec);
      insertSentMeta.run(sId, chunk.id, sentences[sIdx]);
    }
  }

  // --- DATABASE AUDIT ---
  const audit = db.prepare("SELECT content FROM chunk_metadata WHERE sessionId = ?").all(sessionId) as any[];
  logger.info(`AUDIT: Found ${audit.length} chunks in DB for this session.`);
  audit.forEach((a, i) => logger.info(`  Chunk ${i}: ${a.content.substring(0, 50)}...`));

  logger.info("[2/3] Running Precision Retrieval...");
  
  const tests = [
    { name: "Direct FTS5", query: "secret password" },
    { name: "Thematic Vector", query: "What is the vault code?" }
  ];

  const results = await Promise.all(tests.map(async (t) => {
    const start = Date.now();
    const retrieved = await vectorStore.retrieveRelevantChunks(t.query, sessionId, 3);
    const end = Date.now();
    
    const foundNeedle = retrieved.some(r => r.content.includes("ANTIGRAVITY_99"));
    return {
      "Test": t.name,
      "Recall": foundNeedle ? "✅ FOUND" : "❌ MISSED",
      "Latency": (end - start) + "ms",
      "Retrieved": retrieved.length > 0 ? retrieved[0].content.substring(0, 60) + "..." : "EMPTY",
      "Score": retrieved.length > 0 ? retrieved[0].score.toFixed(2) : "0.00"
    };
  }));

  console.table(results);
  logger.info("Benchmark Complete.");
  process.exit(0);
}

runBenchmark().catch(err => {
  logger.error("Benchmark failed: " + err.message);
  process.exit(1);
});
