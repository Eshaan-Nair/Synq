import { llm, extractEntitiesFromQuery, summarizeChunk, extractRelevantSnippets, _resetBackendForTest } from "../services/extractor";
import { generateEmbedding, checkOllamaHealth } from "../services/embeddings";
import * as dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

async function runLiveTest() {
  console.log("\n==========================================");
  console.log("   SYNQ Offline Model Verification");
  console.log("==========================================\n");

  // 1. Check Ollama Health
  const isOllamaUp = await checkOllamaHealth();
  if (isOllamaUp) {
    logger.success("[1/4] Ollama is REACHABLE");
  } else {
    logger.warn("[1/4] Ollama is NOT REACHABLE on " + (process.env.OLLAMA_URL || "http://localhost:11434"));
  }

  // 2. Test Embeddings
  console.log("\n[2/4] Testing Embeddings...");
  const embedModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  try {
    const start = Date.now();
    const vec = await generateEmbedding("Synq is a local-first knowledge graph tool.");
    const end = Date.now();
    logger.success(`Embeddings OK (${embedModel}). Vector size: ${vec.length}. Latency: ${end - start}ms`);
  } catch (err: any) {
    logger.error(`Embeddings FAILED: ${err.message}`);
  }

  // 3. Test LLM Extraction
  console.log("\n[3/4] Testing LLM Extraction (Triples)...");
  _resetBackendForTest(); // Ensure it redetects based on current env
  try {
    const start = Date.now();
    const entities = await extractEntitiesFromQuery("How does Synq use SQLite for vector storage?");
    const end = Date.now();
    logger.success(`LLM Extraction OK. Entities: ${JSON.stringify(entities)}. Latency: ${end - start}ms`);
  } catch (err: any) {
    logger.error(`LLM Extraction FAILED: ${err.message}`);
  }

  // 4. Test Snippet Extraction (Token Optimization)
  console.log("\n[4/4] Testing Snippet Extraction (v1.4.4)...");
  try {
    const prompt = "How do I clear the auth token?";
    const chunks = [
      "Synq uses JWT for authentication.",
      "The authentication token is stored in localStorage. To log out, call clearToken() which removes the item 'auth_token'.",
      "The backend is written in TypeScript."
    ];
    const start = Date.now();
    const snippet = await extractRelevantSnippets(prompt, chunks);
    const end = Date.now();
    
    if (snippet && snippet.toLowerCase().includes("cleartoken")) {
      logger.success(`Snippet Extraction OK. Result length: ${snippet.length} chars. Latency: ${end - start}ms`);
      console.log("\n--- Extracted Snippet ---");
      console.log(snippet);
      console.log("-------------------------\n");
    } else if (snippet) {
      logger.warn(`Snippet Extraction returned data but it might not be perfect. Latency: ${end - start}ms`);
      console.log("Result:", snippet);
    } else {
      logger.error("Snippet Extraction returned NOTHING.");
    }
  } catch (err: any) {
    logger.error(`Snippet Extraction FAILED: ${err.message}`);
  }

  console.log("\n==========================================");
  console.log("   Verification Complete");
  console.log("==========================================\n");
}

runLiveTest().catch(console.error);
