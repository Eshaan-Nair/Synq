import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { extractTriples, generateProjectSummary } from "../services/extractor";
import { saveTriple, getTriplesBySession, getDriver } from "../services/neo4j";
import { Session, getActiveSessionId, setActiveSessionId, FullChat } from "../services/mongo";
import { deleteChunksBySession } from "../services/chroma";
import { logger } from "../utils/logger";
import mongoose from "mongoose";

const router = Router();

// FIX (Bug #7): Static top-level imports replace the dynamic import() calls
// that were inside the DELETE route handler. Dynamic imports inside request
// handlers cause repeated module resolution overhead on every request.

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// POST /api/context/ingest
router.post("/ingest", async (req: Request, res: Response) => {
  const { text, sessionId, platform } = req.body;

  if (!text || !sessionId) {
    res.status(400).json({ error: "text and sessionId are required" });
    return;
  }

  if (typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "text must be at least 10 characters" });
    return;
  }

  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
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
    logger.error("Ingest error:", err);
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

  const VALID_PLATFORMS = ["claude", "chatgpt", "gemini"];
  if (platform && !VALID_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` });
    return;
  }

  if (typeof projectName !== "string" || projectName.trim().length === 0) {
    res.status(400).json({ error: "projectName must be a non-empty string" });
    return;
  }

  try {
    const session = await Session.create({ projectName: projectName.trim(), platform });
    res.json({ sessionId: session._id, projectName });
  } catch (err) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

// GET /api/context/retrieve/:sessionId
router.get("/retrieve/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  try {
    const triples = await getTriplesBySession(sessionId);
    const session = await Session.findById(sessionId).select("projectName summary tripleCount");
    const projectName = session?.projectName || "Unknown Project";

    const contextBlock = triples
      .map(t => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
      .join("\n");

    let structuredSummary = session?.summary || "";
    const cachedCount = session?.tripleCount || 0;

    if (triples.length > 0 && (structuredSummary === "" || cachedCount !== triples.length)) {
      structuredSummary = await generateProjectSummary(triples, projectName);
      await Session.findByIdAndUpdate(sessionId, {
        summary: structuredSummary,
        tripleCount: triples.length,
      });
    }

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
      .select("_id projectName platform tripleCount topicCount hasFullChat createdAt updatedAt");
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
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
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
      .select("_id projectName platform tripleCount topicCount");
    res.json({ activeSession: session || null });
  } catch {
    res.json({ activeSession: null });
  }
});

// DELETE /api/context/session/:sessionId
router.delete("/session/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const sid = sessionId as string;

  if (!isValidObjectId(sid)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  try {
    await Session.findByIdAndDelete(sid);

    // FIX (Bug #7): Use statically imported getDriver() instead of dynamic import
    const neo4jSession = getDriver().session();
    try {
      await neo4jSession.run(
        `MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity) DELETE r`,
        { sessionId: sid }
      );
    } finally {
      await neo4jSession.close();
    }

    // FIX (Bug #7): Use statically imported FullChat and deleteChunksBySession
    try {
      await FullChat.findOneAndDelete({ sessionId: sid });
      await deleteChunksBySession(sid);
    } catch (err) {
      logger.warn("Could not delete chat/vectors:", err);
    }

    const currentActive = await getActiveSessionId();
    if (currentActive === sid) {
      await setActiveSessionId(null);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

export default router;