import axios from "axios";

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
}

export async function extractTriples(text: string): Promise<Triple[]> {
  const prompt = `Extract semantic triples from this AI conversation text.
Return ONLY a valid JSON array of triples, no explanation.

Each triple must have:
- subject: the main entity (e.g. "SplitSmart")
- subjectType: category (e.g. "Project", "Technology", "Feature", "Bug", "Decision")
- relation: the relationship verb in UPPER_SNAKE_CASE (e.g. "USES", "HAS_FEATURE", "DEPENDS_ON")
- object: the related entity (e.g. "JWT")
- objectType: category (e.g. "Auth", "Database", "Library", "API")

Text to extract from:
"""
${text}
"""

Return format:
[{"subject":"...","subjectType":"...","relation":"...","object":"...","objectType":"..."}]`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
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
      console.error("Triple extraction: failed to parse JSON:", clean);
      return [];
    }
  } catch (err: any) {
    console.error("Extraction failed:", JSON.stringify(err?.response?.data, null, 2));
    return [];
  }
}