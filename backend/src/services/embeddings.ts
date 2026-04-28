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
    }, { timeout: 20000 });
    return response.data.embedding as number[];
  } catch (err: any) {
    logger.error("Embedding generation failed:", err?.message);
    throw new Error("Ollama embedding failed. Is Ollama running? Run: ollama serve");
  }
}

// Issue #6 Fix: Generate embeddings in parallel instead of sequentially.
// Previously, 10 topics = 10 sequential HTTP calls (slow).
// Now all embeddings are fired concurrently and awaited together.
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(text => generateEmbedding(text)));
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`);
    return true;
  } catch {
    return false;
  }
}