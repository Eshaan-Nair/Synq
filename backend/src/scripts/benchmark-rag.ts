import { extractRelevantSnippets } from "../services/extractor";
import * as dotenv from "dotenv";

dotenv.config();

async function runBenchmark() {
  process.env.GRAPH_BACKEND = "groq";
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY is not set. Benchmark requires Groq to avoid lagging the local machine.");
    process.exit(1);
  }

  console.log("==========================================");
  console.log("   SYNQ RAG Benchmark - Snippet Extraction");
  console.log("==========================================\n");

  const prompt = "How does the caching layer work?";
  
  // Simulated retrieval chunks
  const chunks = [
    "The Synq architecture consists of a frontend dashboard and a Node.js backend. It uses SQLite for both relational and vector storage.",
    "For performance, we implemented an LRU caching layer using an in-memory Map structure. The caching layer caches API responses and invalidates them after 5 minutes.",
    "The Knowledge Graph is built by extracting semantic triples using a local LLM or Groq. The triples are stored in the 'facts' table."
  ];

  const totalRawChars = chunks.join(" ").length;
  console.log(`Test Prompt: "${prompt}"`);
  console.log(`Raw Context Size: ${totalRawChars} chars (${chunks.length} chunks)`);
  console.log("Extracting snippets using Groq...\n");

  const startTime = Date.now();
  const result = await extractRelevantSnippets(prompt, chunks);
  const endTime = Date.now();

  const totalSnippetChars = result.length;
  const compressionRatio = ((1 - (totalSnippetChars / totalRawChars)) * 100).toFixed(1);

  console.log("--- Extraction Result ---");
  console.log(result || "[No relevance found]");
  console.log("-------------------------");
  
  console.log("\n--- Metrics ---");
  console.log(`Latency: ${endTime - startTime}ms`);
  console.log(`Compressed Context: ${totalSnippetChars} chars`);
  console.log(`Token Savings: ${compressionRatio}% reduction in injected context size!`);
  
  process.exit(0);
}

runBenchmark().catch(console.error);
