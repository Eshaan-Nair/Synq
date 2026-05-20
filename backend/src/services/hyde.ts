import { llm } from "./extractor";
import { logger } from "../utils/logger";

/**
 * Generates a hypothetical answer to the user query (HyDE - Hypothetical Document Embeddings).
 * This bridges the gap between conversational queries and information-dense documents.
 */
export async function generateHyDEAnswer(query: string): Promise<string> {
  const prompt = `User: ${query}\nGenerate a 1-sentence hypothetical answer for vector search:`;

  try {
    logger.debug(`[GLIA] HyDE: "${query.slice(0, 40)}..."`);
    const hypotheticalAnswer = await llm(prompt, 100);
    return hypotheticalAnswer.trim();
  } catch (err) {
    logger.warn(`[GLIA] HyDE generation failed, falling back to raw query: ${err instanceof Error ? err.message : String(err)}`);
    return query;
  }
}
