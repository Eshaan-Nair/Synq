// Generates vector embeddings using Ollama (local, free, no rate limits)
// Model: nomic-embed-text (runs on CPU, ~500MB)

import axios from "axios";
import { logger } from "../utils/logger";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function generateEmbedding(text: string, task: "query" | "document" = "query"): Promise<number[]> {
  const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  const MAX_RETRIES = 3;

  // nomic-embed-text requires specific prefixes for optimal performance
  const prefix = EMBED_MODEL.includes("nomic-embed-text") 
    ? (task === "query" ? "search_query: " : "search_document: ") 
    : "";
  
  const prompt = `${prefix}${text}`;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
        logger.debug(`[GLIA] Retrying embedding generation (attempt ${attempt}/${MAX_RETRIES})...`);
      }

      const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
        model: EMBED_MODEL,
        prompt: prompt,
      }, { timeout: 60000 });
      
      return response.data.embedding as number[];
    } catch (err: any) {
      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
      const isOllamaDown = err.code === "ECONNREFUSED";

      if (isOllamaDown) {
        throw new Error("Ollama is not running. Start it with: ollama serve");
      }

      if (isTimeout && attempt < MAX_RETRIES) {
        logger.warn(`[GLIA] Embedding timeout. Ollama might be busy or model is loading.`);
        continue;
      }

      logger.error("Embedding generation failed:", err?.message);
      throw new Error(`Ollama embedding failed (${EMBED_MODEL}). Is it pulled? Run: ollama pull ${EMBED_MODEL}`);
    }
  }
  throw new Error("Embedding generation failed after retries.");
}

/**
 * Generate embeddings in batches to prevent overwhelming local hardware/Ollama.
 * Previously, 100 chunks = 100 concurrent HTTP calls (timed out).
 * Now we process in chunks of 5 with a tiny rest between batches.
 */
export async function generateEmbeddings(texts: string[], task: "query" | "document" = "document"): Promise<number[][]> {
  const BATCH_SIZE = 3; // Reduced batch size for low-end PCs
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.debug(`[GLIA] Embedding batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(texts.length/BATCH_SIZE)}...`);
    
    try {
      // Process this batch in parallel
      const batchResults = await Promise.all(batch.map(text => generateEmbedding(text, task)));
      results.push(...batchResults);
    } catch (err: any) {
      logger.error(`[GLIA] Batch embedding failed at index ${i}: ${err.message}`);
      throw err;
    }
    
    // Tiny rest to let CPU breathe
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  return results;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

