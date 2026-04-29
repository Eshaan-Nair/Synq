import axios from "axios";
import { logger } from "../utils/logger";

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
  const chunks: string[] = [];
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

async function groq(prompt: string, maxTokens = 1000): Promise<string> {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
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

// Step 1 — compress raw chat into ALL meaningful facts (technical + personal)
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
    return await groq(prompt, 600);
  } catch {
    return text.slice(0, 600); // fallback to truncated raw text
  }
}

// Step 2 — extract triples from compressed summary
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
    const raw = await groq(prompt, 1200);
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as Triple[];
  } catch {
    return [];
  }
}

// Step 3 — generate structured project summary for injection
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
    return await groq(prompt, 400);
  } catch {
    // Fallback — format triples directly
    return triples
      .map(t => `- ${t.subject} ${t.relation.toLowerCase().replace(/_/g, " ")} ${t.object}`)
      .join("\n");
  }
}

export async function extractTriples(text: string): Promise<Triple[]> {
  const chunks = chunkText(text);
  // Issue #4 Fix: Use logger instead of console.log
  logger.info(`Processing ${chunks.length} chunk(s) for triple extraction...`);

  const allTriples: Triple[] = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      logger.info(`  chunk ${i + 1}/${chunks.length} — summarizing...`);

      // Step 1: compress
      const summary = await summarizeChunk(chunks[i]);

      // Step 2: extract triples from summary
      const triples = await extractTriplesFromSummary(summary);
      allTriples.push(...triples);

      logger.info(`  chunk ${i + 1} → ${triples.length} triples`);
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