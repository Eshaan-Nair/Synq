// Generates vector embeddings using Ollama (local, free, no rate limits)
// Model: nomic-embed-text (runs on CPU, ~500MB)

import axios from "axios";
import { logger } from "../utils/logger";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBED_MODEL = "nomic-embed-text";

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: EMBED_MODEL,
      prompt: text,
    }, { timeout: 60000 });
    return response.data.embedding as number[];
  } catch (err: any) {
    logger.error("Embedding generation failed:", err?.message);
    throw new Error("Ollama embedding failed. Is Ollama running? Run: ollama serve");
  }
}

/**
 * Generate embeddings in batches to prevent overwhelming local hardware/Ollama.
 * Previously, 100 chunks = 100 concurrent HTTP calls (timed out).
 * Now we process in chunks of 5 with a tiny rest between batches.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 5;
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info(`[SYNQ] Embedding batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(texts.length/BATCH_SIZE)}...`);
    
    // Process this batch in parallel
    const batchResults = await Promise.all(batch.map(text => generateEmbedding(text)));
    results.push(...batchResults);
    
    // Tiny rest to let CPU breathe if there's a lot more to go
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return results;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`);
    return true;
  } catch {
    return false;
  }
}