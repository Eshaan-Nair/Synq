import axios from "axios";

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
}

const CHUNK_SIZE = 2000; // characters per chunk, safe for Groq free tier

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  
  // Split by paragraph breaks first to avoid cutting mid-sentence
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

async function extractTriplesFromChunk(text: string): Promise<Triple[]> {
  const prompt = `Extract semantic triples from this AI conversation text.
Return ONLY a valid JSON array of triples, no explanation, no markdown.

Each triple must have:
- subject: the main entity (e.g. "SplitSmart")
- subjectType: category (e.g. "Project", "Technology", "Feature", "Bug", "Decision", "Concept")
- relation: the relationship verb in UPPER_SNAKE_CASE (e.g. "USES", "HAS_FEATURE", "DEPENDS_ON", "IS_A", "EXPLAINED_BY")
- object: the related entity (e.g. "JWT")
- objectType: category (e.g. "Auth", "Database", "Library", "API", "Concept", "Property")

Rules:
- Extract as many meaningful triples as possible
- Focus on technical facts, relationships, and decisions
- Avoid generic or trivial triples
- Each triple must be specific and informative

Text:
"""
${text}
"""

Return ONLY a JSON array like:
[{"subject":"...","subjectType":"...","relation":"...","object":"...","objectType":"..."}]`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const raw = response.data.choices[0].message.content;
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as Triple[];
  } catch {
    console.error("Failed to parse chunk response:", clean.slice(0, 200));
    return [];
  }
}

export async function extractTriples(text: string): Promise<Triple[]> {
  const chunks = chunkText(text);
  console.log(`📦 Processing ${chunks.length} chunk(s)...`);

  const allTriples: Triple[] = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`  chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      const triples = await extractTriplesFromChunk(chunks[i]);
      allTriples.push(...triples);

      // Small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise((res) => setTimeout(res, 500));
      }
    } catch (err: any) {
      console.error(`  chunk ${i + 1} failed:`,
        JSON.stringify(err?.response?.data, null, 2)
      );
    }
  }

  // Deduplicate triples by subject+relation+object
  const seen = new Set<string>();
  const unique = allTriples.filter((t) => {
    const key = `${t.subject}|${t.relation}|${t.object}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`✅ Extracted ${unique.length} unique triples from ${chunks.length} chunks`);
  return unique;
}