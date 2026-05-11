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

export function chunkText(text: string): string[] {
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

// ── v1.4.6: Smart Backend Selection ───────────────────────────────
//
// Priority:
//   1. GRAPH_BACKEND env var (explicit override — "ollama" | "groq" | "local-openai")
//   2. Auto-detect: probe Ollama at startup → use if available
//   3. Auto-detect: probe LM Studio / LocalAI at startup
//   4. Fallback: Groq (requires GROQ_API_KEY — warns that data leaves machine)
//
// This serves all hardware tiers without manual configuration:
//   - Full local setup:  Ollama runs  → fully private, zero external calls
//   - Low-spec setup:    Ollama absent → Groq used, warning logged
//   - Explicit override: GRAPH_BACKEND=groq forces Groq regardless of Ollama
// ────────────────────────────────────────────────────────────────────

let resolvedBackend: "ollama" | "groq" | "local-openai" | null = null;

async function detectBackend(): Promise<"ollama" | "groq" | "local-openai"> {
  // Explicit override takes highest priority
  const envBackend = process.env.GRAPH_BACKEND?.toLowerCase();
  if (envBackend === "groq") return "groq";
  if (envBackend === "ollama") return "ollama";
  if (envBackend === "local-openai") return "local-openai";

  // Auto-detect: try to reach Ollama
  try {
    const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    await axios.get(`${ollamaUrl}/api/tags`, { timeout: 2000 });
    logger.success("[GLIA] Ollama detected — graph extraction will run locally (fully private)");
    return "ollama";
  } catch {
    // Try Local OpenAI (LM Studio / LocalAI)
    try {
      const localUrl = process.env.LOCAL_OPENAI_URL ?? "http://localhost:1234/v1";
      await axios.get(`${localUrl}/models`, { timeout: 2000 });
      logger.success("[GLIA] LM Studio / LocalAI detected — using local OpenAI-compatible backend");
      return "local-openai";
    } catch {
      if (process.env.GROQ_API_KEY) {
        logger.warn(
          "[GLIA] Local LLM (Ollama/LM Studio) not available — falling back to Groq API. " +
          "Note: PII-scrubbed conversation text will leave your machine via Groq."
        );
        return "groq";
      } else {
        logger.warn(
          "[GLIA] No local LLM found and GROQ_API_KEY missing. " +
          "Graph extraction disabled — install Ollama or set GROQ_API_KEY in backend/.env"
        );
        return "groq";
      }
    }
  }
}

async function getBackend(): Promise<"ollama" | "groq" | "local-openai"> {
  if (!resolvedBackend) {
    resolvedBackend = await detectBackend();
  }
  return resolvedBackend;
}

/** @internal - For test cleanup only */
export function _resetBackendForTest() {
  resolvedBackend = null;
}

// ── Groq LLM call ─────────────────────────────────────────────────
async function callGroq(prompt: string, maxTokens = 1000): Promise<string> {
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1,
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
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
    { timeout: 90000 } // Increased to 90s for low-end hardware
  );
  return response.data.response;
}

// ── Local OpenAI (LM Studio / LocalAI) LLM call ───────────────────
async function callLocalOpenAI(prompt: string, maxTokens = 1000): Promise<string> {
  const url = process.env.LOCAL_OPENAI_URL ?? "http://localhost:1234/v1";
  const model = process.env.LOCAL_OPENAI_MODEL ?? "loaded_model"; // LM Studio usually uses whatever is loaded

  const response = await axios.post(
    `${url}/chat/completions`,
    {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1,
    },
    { timeout: 90000 }
  );
  return response.data.choices[0].message.content;
}

// ── Unified LLM call with Retry Logic (Backoff) ───────────────────
async function _llm(prompt: string, maxTokens = 1000): Promise<string> {
  const backend = await getBackend();
  const MAX_RETRIES = 3; // Reduced total retries but made each smarter
  let lastErr: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const waitTime = attempt * 15000; // 15s, 30s, 45s...
        logger.info(`[GLIA] LLM call retry ${attempt}/${MAX_RETRIES} in ${waitTime / 1000}s...`);
        await sleep(waitTime);
      }

      let res: string;
      if (backend === "ollama") {
        try {
          res = await callOllama(prompt, maxTokens);
        } catch (err: any) {
          const isDown = err.code === "ECONNREFUSED" ||
            err.code === "ENOTFOUND" ||
            err.message?.includes("ECONNREFUSED") ||
            err.message?.includes("connection refused");
          if (isDown && process.env.GROQ_API_KEY) {
            logger.warn(`[GLIA] Ollama unreachable — falling back to Groq.`);
            res = await callGroq(prompt, maxTokens);
          } else {
            throw err;
          }
        }
      } else if (backend === "local-openai") {
        try {
          res = await callLocalOpenAI(prompt, maxTokens);
        } catch (err: any) {
          const isDown = err.code === "ECONNREFUSED" ||
            err.code === "ENOTFOUND" ||
            err.message?.includes("ECONNREFUSED") ||
            err.message?.includes("connection refused");
          if (isDown && process.env.GROQ_API_KEY) {
            logger.warn(`[GLIA] Local OpenAI unreachable — falling back to Groq.`);
            res = await callGroq(prompt, maxTokens);
          } else {
            throw err;
          }
        }
      } else {
        res = await callGroq(prompt, maxTokens);
      }

      if (res === undefined || res === null || res.trim() === "") {
        throw new Error("Model returned empty response");
      }
      return res;
    } catch (err: any) {
      lastErr = err;
      const isRateLimit = err?.response?.status === 429 || err?.message?.includes("429");
      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
      const isBadFormat = err?.message?.includes("JSON") || err?.message?.includes("formatting");

      if ((isRateLimit || isTimeout || isBadFormat) && attempt < MAX_RETRIES) {
        if (isTimeout) logger.warn(`[GLIA] LLM timeout (attempt ${attempt + 1}). Model might be loading or hardware is slow.`);
        if (isBadFormat) logger.warn("[GLIA] Model returned malformed data. Retrying...");
        continue;
      }

      // Permanent failure
      logger.error(`[GLIA] LLM call failed permanently: ${err.message}`);
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Unified LLM call with explicit debug logging
 */
export async function llm(prompt: string, maxTokens = 1000): Promise<string> {
  const result = await _llm(prompt, maxTokens);
  if (process.env.DEBUG === "true") {
    logger.info(`[DEBUG] LLM Response (${result.length} chars): ${result.slice(0, 100)}...`);
  }
  return result;
}

// ── Step 1: compress raw chat into ALL meaningful facts ────────────
export async function summarizeChunk(text: string): Promise<string> {
  const prompt = `You are a precision fact extractor. Read this conversation and extract ALL meaningful facts.

CRITICAL RULES:
- Preserve the EXACT nature of every relationship. Examples:
  * "I am a student at X" → fact: "User is a STUDENT at X" (NOT an employee)
  * "I work at X" → fact: "User WORKS AT X" (employee)
  * "I study X" → fact: "User STUDIES X"
  * "I am in semester N" → fact: "User is in semester N"
  * "I am building X" → fact: "User IS BUILDING X"
- Extract ALL of the following:
  * Academic facts: institution name, degree, semester/year, field of study, courses
  * Professional facts: job title, employer, projects, tech stack, decisions made
  * Personal facts: name, location, pets (with EXPLICIT animal type), preferences, goals, hobbies
  * Technical facts: technologies used, bugs encountered, features built, architecture choices
  * Named entities: project names, company names, product names, tool names
- Do NOT skip any named entity or relationship, even if it seems minor.
- Remove ONLY pure filler ("ok", "thanks", "sure") with zero information content.
- Output as a bullet list. Each bullet = one precise fact. Be specific.

Conversation:
"""
${text}
"""

Facts:`;

  return await llm(prompt, 800);
}

/**
 * Step 1.5: Extract entities from a search query for Hybrid RAG.
 */
export async function extractEntitiesFromQuery(query: string): Promise<string[]> {
  const prompt = `Extract entities from this search query. Be broad and include any potential projects, technologies, or people mentioned.
Return ONLY a JSON array of strings, or "none" if no entities are found.

Example: ["React", "Glia", "Eshaan"]

Query: "${query}"

Entities:`;

  try {
    const raw = await llm(prompt, 100);
    if (!raw || raw.toLowerCase().includes("none")) return [];

    // 1. Try to parse as JSON first
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start !== -1 && end !== -1) {
        const clean = raw.slice(start, end + 1).trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return parsed.map(e => String(e).trim()).filter(Boolean);
        }
      }
    } catch {
      // Fallback to manual parsing
    }

    // 2. Fallback cleanup: remove brackets, quotes, and "Entities:" prefix
    return raw.replace(/[\[\]"]/g, "")
      .replace(/Entities:/gi, "")
      .split(",")
      .map(e => e.trim())
      .filter(e => {
        return e.length > 0 &&
          e.length < 50 &&
          e.toLowerCase() !== "none" &&
          !e.toLowerCase().includes("not json");
      });
  } catch (err) {
    logger.warn(`[GLIA] Entity extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Step 2: extract triples from compressed summary ───────────────
export async function extractTriplesFromSummary(summary: string): Promise<Triple[]> {
  const prompt = `Extract semantic triples from these facts.
Return ONLY a valid JSON array, no explanation, no markdown, no code fences.

Each triple MUST have these exact fields:
- subject: the main entity name (e.g. "Eshaan", "Glia", "React", "User")
- subjectType: MUST be exactly one of:
  "Person" | "Pet" | "Organization" | "Location" | "Education"
  "Project" | "Technology" | "Feature" | "Bug" | "Decision"
  "Library" | "API" | "Database" | "Framework" | "Auth" | "Architecture"
  "Goal" | "Problem" | "Preference" | "Habit" | "Tool" | "Pattern" | "Concept"
- relation: UPPER_SNAKE_CASE. Choose the MOST ACCURATE from this list:
  Academic:    STUDIES_AT | ENROLLED_IN | IN_SEMESTER | STUDIES | GRADUATED_FROM | MAJORS_IN
  Personal:    IS_NAMED | OWNS | HAS_PET | LIVES_IN | LIVES_WITH | PREFERS | INTERESTED_IN | WANTS | KNOWS
  Professional: WORKS_AT | WORKS_ON | CREATED_BY | COLLABORATED_WITH | REPORTS_TO
  Technical:   USES | DEPENDS_ON | HAS_FEATURE | INTEGRATES_WITH | STORES_IN | RUNS_ON | AUTHENTICATES_WITH
  General:     IS_A | HAS | IS_BUILDING | IS_IN | PART_OF | DECIDED_TO | STRUGGLING_WITH | SOLVED_WITH
- object: the target entity name
- objectType: same valid values as subjectType

STRICT CLASSIFICATION RULES — read carefully:
1. STUDENT vs EMPLOYEE distinction (most important):
   - "student at X", "studying at X", "enrolled at X", "attend X" → relation MUST be STUDIES_AT
   - "work at X", "employed at X", "job at X" → relation MUST be WORKS_AT
   - NEVER use WORKS_AT for a student. NEVER use STUDIES_AT for an employee.
2. Semester / academic year → use IN_SEMESTER, objectType "Education"
3. Educational institutions (universities, colleges, schools) → objectType MUST be "Organization"
4. Field of study, degree, course → objectType MUST be "Education"
5. AI model names (Claude, Gemini, GPT, ChatGPT, Copilot, Llama, Mistral, Grok, Sonnet) → subjectType MUST be "Technology". NEVER "Person" or "Pet".
6. Only use "Pet" if the text EXPLICITLY says "my [animal]" or "I have a [animal named X]". Never infer pets from names alone.
7. Only use "Person" for real human beings explicitly identified as people.
8. Programming languages, frameworks, libraries, tools, APIs → ALWAYS "Technology".
9. Extract ALL relationships. If in doubt, include it.

EXAMPLES (abbreviated — follow the same pattern for all conversation types):
"User is a student at KIIT" → STUDIES_AT (NOT WORKS_AT)
"User is in 8th semester" → IN_SEMESTER, objectType "Education"
"User works at Google" → WORKS_AT, objectType "Organization"
"Project uses React, has CORS bug" → USES (Technology), STRUGGLING_WITH (Bug)
"User chose PostgreSQL over MongoDB" → DECIDED_TO + STORES_IN (Database)

Facts:
"""
${summary}
"""

Return ONLY: [{"subject":"...","subjectType":"...","relation":"...","object":"...","objectType":"..."}]`;

  const raw = await llm(prompt, 1500);

  // More robust JSON extraction: find the first '[' and last ']'
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");

  if (start === -1 || end === -1) {
    throw new Error("Bad formatting: No JSON array found in model output");
  }

  const clean = raw.slice(start, end + 1).trim();
  try {
    return JSON.parse(clean) as Triple[];
  } catch (jsonErr) {
    throw new Error(`Bad formatting: JSON parse error - ${clean.slice(0, 50)}`);
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

export async function extractTriples(text: string, startIndex = 0): Promise<{ triples: Triple[], nextIndex: number }> {
  const chunks = chunkText(text);
  logger.info(`Processing ${chunks.length} chunk(s) for triple extraction...`);

  const allTriples: Triple[] = [];

  for (let i = startIndex; i < chunks.length; i++) {
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
  return { triples: unique, nextIndex: chunks.length };
}

/**
 * v1.4.6: Token Optimization via Snippet Extraction
 * Reads raw retrieved chunks and uses the LLM to extract ONLY the exact lines
 * relevant to the user's prompt. This prevents dumping 1500+ words of raw context
 * into the final RAG prompt, significantly reducing token cost and hallucination risk.
 */
export async function extractRelevantSnippets(prompt: string, chunks: string[]): Promise<string> {
  if (!chunks.length) return "";

  const context = chunks.map((c, i) => `[CHUNK ${i + 1}]\n${c}`).join("\n\n");

  const fullPrompt = `USER PROMPT: ${prompt}

TEXT CHUNKS:
${context}

Copy any sentences from the TEXT CHUNKS above that help answer the USER PROMPT.
If nothing matches, say "None".

Relevant parts:`;

  try {
    // We use the unified llm() which handles retries, fallbacks, and temperature=0.1
    const responseText = await llm(fullPrompt, 1500);

    if (responseText.includes("None") || responseText.includes("NO_RELEVANCE") || responseText.trim().length < 5) {
      return "";
    }

    return responseText.trim();
  } catch (err: any) {
    logger.warn(`[Extractor] Snippet extraction failed: ${err?.message || "Unknown error"}`);
    if (err?.stack) console.error(err.stack);
    // Fallback: return raw chunks up to ~2500 chars to prevent complete RAG failure
    return chunks.join("\n...\n").slice(0, 2500);
  }
}
