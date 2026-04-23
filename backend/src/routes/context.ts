import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { extractTriples, generateProjectSummary } from "../services/extractor";
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
    const session = await Session.findById(sessionId).select("projectName");
    const projectName = session?.projectName || "Unknown Project";

    // Raw triple format for graph/timeline
    const contextBlock = triples
      .map(t => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
      .join("\n");

    // Generate structured summary for injection
    const structuredSummary = triples.length > 0
      ? await generateProjectSummary(triples, projectName)
      : "";

    res.json({
      sessionId,
      tripleCount: triples.length,
      contextBlock,
      structuredSummary,
      triples,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve context" });
  }
});

// GET /api/context/sessions
// Returns all sessions for the history tab
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

// In-memory active session store
let activeSessionId: string | null = null;

// POST /api/context/active
// Dashboard sets the active session
router.post("/active", (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  activeSessionId = sessionId;
  res.json({ success: true, activeSessionId });
});

// GET /api/context/active
// Extension reads the active session
router.get("/active", async (req: Request, res: Response) => {
  if (!activeSessionId) {
    res.json({ activeSession: null });
    return;
  }
  try {
    const session = await Session.findById(activeSessionId)
      .select("_id projectName platform tripleCount");
    res.json({ activeSession: session });
  } catch {
    res.json({ activeSession: null });
  }
});

// DELETE /api/context/session/:sessionId
router.delete("/session/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    // Delete from MongoDB
    await Session.findByIdAndDelete(sessionId);

    // Delete from Neo4j
    const { getDriver } = await import("../services/neo4j");
    const neo4jSession = getDriver().session();
    try {
      await neo4jSession.run(
        `MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity)
         DELETE r`,
        { sessionId }
      );
    } finally {
      await neo4jSession.close();
    }

    // Clear active session if deleted
    if (activeSessionId === sessionId) activeSessionId = null;

    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

export default router;