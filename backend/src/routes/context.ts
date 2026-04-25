import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { extractTriples, generateProjectSummary } from "../services/extractor";
import { saveTriple, getTriplesBySession } from "../services/neo4j";
import { Session, getActiveSessionId, setActiveSessionId } from "../services/mongo";

const router = Router();

// POST /api/context/ingest
router.post("/ingest", async (req: Request, res: Response) => {
  const { text, sessionId, platform } = req.body;

  if (!text || !sessionId) {
    res.status(400).json({ error: "text and sessionId are required" });
    return;
  }

  try {
    const cleanText = scrubPII(text);
    const triples = await extractTriples(cleanText);

    for (const t of triples) {
      await saveTriple(
        t.subject, t.subjectType,
        t.relation,
        t.object, t.objectType,
        sessionId
      );
    }

    await Session.findByIdAndUpdate(sessionId, {
      updatedAt: new Date(),
      $inc: { tripleCount: triples.length },
    });

    res.json({ success: true, triplesExtracted: triples.length, triples });
  } catch (err) {
    console.error("Ingest error:", err);
    res.status(500).json({ error: "Failed to process context" });
  }
});

// POST /api/context/session
router.post("/session", async (req: Request, res: Response) => {
  const { projectName, platform } = req.body;
  if (!projectName) {
    res.status(400).json({ error: "projectName is required" });
    return;
  }
  try {
    const session = await Session.create({ projectName, platform });
    res.json({ sessionId: session._id, projectName });
  } catch (err) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

// GET /api/context/retrieve/:sessionId
router.get("/retrieve/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  try {
    const triples = await getTriplesBySession(sessionId);
    const session = await Session.findById(sessionId).select("projectName");
    const projectName = session?.projectName || "Unknown Project";

    const contextBlock = triples
      .map(t => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
      .join("\n");

    const structuredSummary = triples.length > 0
      ? await generateProjectSummary(triples, projectName)
      : "";

    res.json({ sessionId, tripleCount: triples.length, contextBlock, structuredSummary, triples });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve context" });
  }
});

// GET /api/context/sessions
router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const sessions = await Session.find()
      .sort({ updatedAt: -1 })
      .select("_id projectName platform tripleCount createdAt updatedAt");
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// POST /api/context/active
router.post("/active", async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  try {
    await setActiveSessionId(sessionId);
    res.json({ success: true, activeSessionId: sessionId });
  } catch (err) {
    res.status(500).json({ error: "Failed to set active session" });
  }
});

// GET /api/context/active
router.get("/active", async (req: Request, res: Response) => {
  try {
    const activeSessionId = await getActiveSessionId();
    if (!activeSessionId) {
      res.json({ activeSession: null });
      return;
    }
    const session = await Session.findById(activeSessionId)
      .select("_id projectName platform tripleCount");
    res.json({ activeSession: session || null });
  } catch {
    res.json({ activeSession: null });
  }
});

// DELETE /api/context/session/:sessionId
router.delete("/session/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    await Session.findByIdAndDelete(sessionId);

    const { getDriver } = await import("../services/neo4j");
    const neo4jSession = getDriver().session();
    try {
      await neo4jSession.run(
        `MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity) DELETE r`,
        { sessionId }
      );
    } finally {
      await neo4jSession.close();
    }

    const currentActive = await getActiveSessionId();
    if (currentActive === sessionId) {
      await setActiveSessionId(null);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

export default router;