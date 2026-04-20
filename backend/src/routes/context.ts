import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { extractTriples } from "../services/extractor";
import { saveTriple, getTriplesBySession } from "../services/neo4j";
import { Session } from "../services/mongo";

const router = Router();

// POST /api/context/ingest
// Called by extension when a new AI response is detected
router.post("/ingest", async (req: Request, res: Response) => {
  const { text, sessionId, platform } = req.body;

  if (!text || !sessionId) {
    res.status(400).json({ error: "text and sessionId are required" });
    return;
  }

  try {
    // 1. Scrub secrets
    const cleanText = scrubPII(text);

    // 2. Extract triples via Claude
    const triples = await extractTriples(cleanText);

    // 3. Save each triple to Neo4j
    for (const t of triples) {
      await saveTriple(
        t.subject, t.subjectType,
        t.relation,
        t.object, t.objectType,
        sessionId
      );
    }

    // 4. Update session metadata in MongoDB
    await Session.findByIdAndUpdate(
      sessionId,
      {
        updatedAt: new Date(),
        $inc: { tripleCount: triples.length },
      }
    );

    res.json({ success: true, triplesExtracted: triples.length, triples });
  } catch (err) {
    console.error("Ingest error:", err);
    res.status(500).json({ error: "Failed to process context" });
  }
});

// POST /api/context/session
// Creates a new session for a project
router.post("/session", async (req: Request, res: Response) => {
  const { projectName, platform } = req.body;
  try {
    const session = await Session.create({ projectName, platform });
    res.json({ sessionId: session._id, projectName });
  } catch (err) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

// GET /api/context/retrieve/:sessionId
// Called by extension on new chat — returns context to inject
router.get("/retrieve/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  try {
    const triples = await getTriplesBySession(sessionId);

    // Format into a human+AI readable context block
    const contextBlock = triples
      .map((t) => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
      .join("\n");

    res.json({
      sessionId,
      tripleCount: triples.length,
      contextBlock,
      triples,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve context" });
  }
});

export default router;