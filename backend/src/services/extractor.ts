import axios from "axios";

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
    }
  );
  return response.data.choices[0].message.content;
}

// Step 1 — compress raw chat into technical facts only
async function summarizeChunk(text: string): Promise<string> {
  const prompt = `You are a technical fact extractor. Read this AI conversation and extract ONLY:
- Technologies, libraries, frameworks mentioned
- Technical decisions made
- Features being built
- Bugs or issues discussed
- Project names and their components
- Any code patterns or architectural decisions

Remove ALL conversational filler, greetings, explanations of basics, and repeated information.
Output ONLY a compressed bullet list of facts. Be extremely concise.

Conversation:
"""
${text}
"""

Compressed technical facts:`;

  try {
    return await groq(prompt, 500);
  } catch {
    return text.slice(0, 500); // fallback to truncated raw text
  }
}

// Step 2 — extract triples from compressed summary
async function extractTriplesFromSummary(summary: string): Promise<Triple[]> {
  const prompt = `Extract semantic triples from these technical facts.
Return ONLY a valid JSON array, no explanation, no markdown.

Each triple:
- subject: main entity (e.g. "SplitSmart", "JWT", "MongoDB")
- subjectType: "Project" | "Technology" | "Feature" | "Bug" | "Decision" | "Concept" | "Library" | "API" | "Database" | "Framework" | "Auth" | "Architecture"
- relation: UPPER_SNAKE_CASE verb (e.g. "USES", "HAS_FEATURE", "DEPENDS_ON", "IS_A", "STORES_IN", "AUTHENTICATES_WITH")
- object: related entity
- objectType: same categories as subjectType

Facts:
"""
${summary}
"""

Return ONLY: [{"subject":"...","subjectType":"...","relation":"...","object":"...","objectType":"..."}]`;

  try {
    const raw = await groq(prompt, 1000);
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
  console.log(`📦 Processing ${chunks.length} chunk(s)...`);

  const allTriples: Triple[] = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`  chunk ${i + 1}/${chunks.length} — summarizing...`);

      // Step 1: compress
      const summary = await summarizeChunk(chunks[i]);

      // Step 2: extract triples from summary
      const triples = await extractTriplesFromSummary(summary);
      allTriples.push(...triples);

      console.log(`  chunk ${i + 1} → ${triples.length} triples`);

      if (i < chunks.length - 1) {
        await new Promise(res => setTimeout(res, 500));
      }
    } catch (err: any) {
      console.error(`  chunk ${i + 1} failed:`, JSON.stringify(err?.response?.data, null, 2));
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

  console.log(`✅ Extracted ${unique.length} unique triples from ${chunks.length} chunks`);
  return unique;
}