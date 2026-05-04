import axios from "axios";
import { logger } from "../utils/logger";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
}

export interface ProjectSummary {
  projectName: string;
  stack: string[];
  decisions: string[];
  features: string[];
  status: string;
  triples: Triple[];
}

const CHUNK_SIZE = 2000;

function chunkText(text: string): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/);
  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length > CHUNK_SIZE) {
      if (current.trim()) chunks.push(current.trim());
      current = para;
    } else {
      current += "\n\n" + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── v1.4.0: Smart Backend Selection ───────────────────────────────
//
// Priority:
//   1. GRAPH_BACKEND env var (explicit override — "ollama" | "groq")
//   2. Auto-detect: probe Ollama at startup → use if available
//   3. Fallback: Groq (requires GROQ_API_KEY — warns that data leaves machine)
//
// This serves all hardware tiers without manual configuration:
//   - Full local setup:  Ollama runs  → fully private, zero external calls
//   - Low-spec setup:    Ollama absent → Groq used, warning logged
//   - Explicit override: GRAPH_BACKEND=groq forces Groq regardless of Ollama
// ────────────────────────────────────────────────────────────────────

let resolvedBackend: "ollama" | "groq" | null = null;

async function detectBackend(): Promise<"ollama" | "groq"> {
  // Explicit override takes highest priority
  const envBackend = process.env.GRAPH_BACKEND?.toLowerCase();
  if (envBackend === "groq")   return "groq";
  if (envBackend === "ollama") return "ollama";

  // Auto-detect: try to reach Ollama
  try {
    const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    await axios.get(`${ollamaUrl}/api/tags`, { timeout: 2000 });
    logger.success("[SYNQ] Ollama detected — graph extraction will run locally (fully private)");
    return "ollama";
  } catch {
    if (process.env.GROQ_API_KEY) {
      logger.warn(
        "[SYNQ] Ollama not available — falling back to Groq API for graph extraction. " +
        "Note: PII-scrubbed conversation text will leave your machine via Groq."
      );
      return "groq";
    } else {
      logger.warn(
        "[SYNQ] Neither Ollama nor GROQ_API_KEY available. " +
        "Graph extraction disabled — install Ollama or set GROQ_API_KEY in backend/.env"
      );
      return "groq"; // Will fail gracefully in extractViaGroq when key is missing
    }
  }
}

async function getBackend(): Promise<"ollama" | "groq"> {
  if (!resolvedBackend) {
    resolvedBackend = await detectBackend();
  }
  return resolvedBackend;
}

// ── Groq LLM call ─────────────────────────────────────────────────
async function callGroq(prompt: string, maxTokens = 1000): Promise<string> {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1,
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
  return response.data.choices[0].message.content;
}

// ── Ollama LLM call ───────────────────────────────────────────────
async function callOllama(prompt: string, maxTokens = 1000): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
  
  const response = await axios.post(
    `${ollamaUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: { num_predict: maxTokens, temperature: 0.1 },
    },
    { timeout: 75000 } // Bumped to 75s for slower hardware
  );
  return response.data.response;
}

// ── Unified LLM call with Retry Logic (Backoff) ───────────────────
async function llm(prompt: string, maxTokens = 1000): Promise<string> {
  const backend = await getBackend();
  const MAX_RETRIES = 3;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const waitTime = attempt * 5000; // 5s, 10s, 15s...
        logger.info(`[SYNQ] Rate limit hit. Retrying in ${waitTime/1000}s (Attempt ${attempt}/${MAX_RETRIES})...`);
        await sleep(waitTime);
      }

      if (backend === "ollama") {
        try {
          return await callOllama(prompt, maxTokens);
        } catch (err: any) {
          if (process.env.GROQ_API_KEY) {
            logger.warn(`[SYNQ] Ollama call failed (${err?.message}) — falling back to Groq.`);
            return await callGroq(prompt, maxTokens);
          }
          throw err;
        }
      }
      return await callGroq(prompt, maxTokens);
    } catch (err: any) {
      lastErr = err;
      const isRateLimit = err?.response?.status === 429 || err?.message?.includes("429");
      const isBadFormat = err?.message?.includes("JSON") || err?.message?.includes("formatting");
      
      if ((isRateLimit || isBadFormat) && attempt < MAX_RETRIES) {
        if (isBadFormat) logger.warn("[SYNQ] Model returned malformed data. Retrying...");
        continue; // Loop again (retry)
      }
      throw err; // Permanent failure or no retries left
    }
  }
  throw lastErr;
}

// ── Step 1: compress raw chat into ALL meaningful facts ────────────
async function summarizeChunk(text: string): Promise<string> {
  const prompt = `You are a fact extractor. Read this conversation and extract ALL meaningful facts including:
- Technologies, libraries, frameworks, tools used
- Technical decisions, bugs, features, architecture patterns
- Personal facts: names of people, pets, places, preferences, hobbies, goals
- Relationships: who owns what, who knows what, what the user wants or is building
- Any specific named entities (project names, company names, product names)

Do NOT skip personal or casual facts — they are important.
Remove only pure filler ("thanks", "sounds good", "ok") with no information content.
Output a compressed bullet list of facts. Be specific and concise.

Conversation:
"""
${text}
"""

Facts:`;

  try {
    return await llm(prompt, 600);
  } catch {
    return text.slice(0, 600); // fallback to truncated raw text
  }
}

// ── Step 2: extract triples from compressed summary ───────────────
async function extractTriplesFromSummary(summary: string): Promise<Triple[]> {
  const prompt = `Extract semantic triples from these facts.
Return ONLY a valid JSON array, no explanation, no markdown.

Each triple MUST have:
- subject: the main entity (e.g. "Noob", "SplitSmart", "JWT", "MongoDB", "User")
- subjectType: one of:
  "Project" | "Technology" | "Feature" | "Bug" | "Decision" | "Concept" |
  "Library" | "API" | "Database" | "Framework" | "Auth" | "Architecture" |
  "Person" | "Pet" | "Goal" | "Problem" | "Preference" | "Tool" | "Pattern" |
  "Location" | "Organization" | "Habit"
- relation: UPPER_SNAKE_CASE verb, e.g.:
  "USES" | "HAS_FEATURE" | "DEPENDS_ON" | "IS_A" | "STORES_IN" |
  "AUTHENTICATES_WITH" | "OWNS" | "NAMED" | "PREFERS" | "WANTS" | "KNOWS" |
  "HAS" | "LIVES_WITH" | "IS_BUILDING" | "SOLVED_WITH" | "STRUGGLING_WITH" |
  "DECIDED_TO" | "INTERESTED_IN" | "WORKS_AT" | "CREATED_BY" | "RUNS_ON"
- object: the related entity
- objectType: same categories as subjectType

STRICT CLASSIFICATION RULES (follow these exactly):
1. AI model names (Gemini, Claude, GPT, GPT-4, ChatGPT, Sonnet, Llama, Mistral,
   Copilot, Grok, etc.) MUST be classified as "Technology". NEVER as Pet or Person.
2. Only classify as "Pet" if the text EXPLICITLY says "my [animal] named X" or
   "I have a [animal] called X". Do not infer pets from names alone.
3. Only classify as "Person" for real human names clearly identified as people.
4. Programming languages, frameworks, tools, and APIs are always "Technology".
5. Extract personal facts: if user says "my cat's name is John", extract
   (Pet: John) -[OWNED_BY]-> (Person: User).
6. Do not extract triples about things that are not clearly stated as facts.

Facts:
"""
${summary}
"""

Return ONLY: [{"subject":"...","subjectType":"...","relation":"...","object":"...","objectType":"..."}]`;

  try {
    const raw   = await llm(prompt, 1200);
    const backend = await getBackend();
    
    // More robust JSON extraction: find the first '[' and last ']'
    const start = raw.indexOf("[");
    const end   = raw.lastIndexOf("]");
    
    if (start === -1 || end === -1) {
      throw new Error("Bad formatting: No JSON array found in model output");
    }
    
    const clean = raw.slice(start, end + 1).trim();
    try {
      return JSON.parse(clean) as Triple[];
    } catch (jsonErr) {
      throw new Error(`Bad formatting: JSON parse error - ${clean.slice(0, 50)}`);
    }
  } catch (err: any) {
    logger.error(`[SYNQ] Triple extraction failed: ${err?.message}`);
    return [];
  }
}

// ── Step 3: generate structured project summary ───────────────────
export async function generateProjectSummary(
  triples: Triple[],
  projectName: string
): Promise<string> {
  if (triples.length === 0) return "";

  const tripleText = triples
    .map(t => `${t.subject} (${t.subjectType}) ${t.relation} ${t.object} (${t.objectType})`)
    .join("\n");

  const prompt = `Convert these knowledge graph triples into a concise, structured project context summary.
Format it as clean markdown that an AI assistant can quickly understand.
Be specific and technical. No fluff.

Project name: ${projectName}
Triples:
${tripleText}

Generate a structured summary with sections: Stack, Key Decisions, Features, and any other relevant sections.
Keep it under 200 words total.`;

  try {
    return await llm(prompt, 400);
  } catch {
    // Fallback — format triples directly
    return triples
      .map(t => `- ${t.subject} ${t.relation.toLowerCase().replace(/_/g, " ")} ${t.object}`)
      .join("\n");
  }
}

export async function extractTriples(text: string): Promise<Triple[]> {
  const chunks = chunkText(text);
  logger.info(`Processing ${chunks.length} chunk(s) for triple extraction...`);

  const allTriples: Triple[] = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      logger.info(`  chunk ${i + 1}/${chunks.length} — summarizing...`);

      const summary = await summarizeChunk(chunks[i]);
      
      // Delay to stay under Groq TPM limit
      await sleep(3000);
      
      const triples = await extractTriplesFromSummary(summary);
      allTriples.push(...triples);

      logger.info(`  chunk ${i + 1} → ${triples.length} triples`);
      
      // Delay before next chunk
      if (i < chunks.length - 1) await sleep(2000);
    } catch (err: any) {
      logger.error(`chunk ${i + 1} failed:`, JSON.stringify(err?.response?.data, null, 2));
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = allTriples.filter(t => {
    const key = `${t.subject}|${t.relation}|${t.object}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.success(`Extracted ${unique.length} unique triples from ${chunks.length} chunks`);
  return unique;
}