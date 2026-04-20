import axios from "axios";

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
}

export async function extractTriples(text: string): Promise<Triple[]> {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Extract semantic triples from this AI conversation text.
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
[{"subject":"...","subjectType":"...","relation":"...","object":"...","objectType":"..."}]`,
        },
      ],
    },
    {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  const raw = response.data.content[0].text;
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as Triple[];
  } catch {
    console.error("Triple extraction: failed to parse JSON response:", clean);
    return [];
  }
}