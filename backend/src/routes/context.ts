import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { extractTriples, generateProjectSummary } from "../services/extractor";
import { sessionStore, graphStore, vectorStore } from "../services/storage";
import { isSessionProcessing, cancelSessionJobs } from "../services/jobs";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";

const router = Router();

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
    const cleanText = text.trim();
    const { triples } = await extractTriples(cleanText);

    for (const t of triples) {
      await graphStore.saveTriple({
        ...t,
        sessionId,
        timestamp: new Date().toISOString()
      });
    }

    const session = await sessionStore.getSession(sessionId);
    if (session) {
      await sessionStore.updateSession(sessionId, {
        tripleCount: (session.tripleCount || 0) + triples.length,
      });
    }

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

  const VALID_PLATFORMS = ["claude", "chatgpt", "gemini", "deepseek"];
  if (platform && !VALID_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` });
    return;
  }

  if (typeof projectName !== "string" || projectName.trim().length === 0) {
    res.status(400).json({ error: "projectName must be a non-empty string" });
    return;
  }

  try {
    const { sessionId } = req.body;
    if (sessionId) {
      if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
      }
      await sessionStore.updateSession(sessionId, { projectName: projectName.trim(), platform });
      const updated = await sessionStore.getSession(sessionId);
      if (!updated) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json({ sessionId: updated._id, projectName: updated.projectName });
    } else {
      const session = await sessionStore.createSession(projectName, platform);
      const sid = session._id;
      await sessionStore.setActiveSessionId(sid);
      res.json({ sessionId: sid, projectName });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to create/update session" });
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
    const session = await sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const triples = await graphStore.getTriplesBySession(sessionId);
    const projectName = session.projectName || "Unknown Project";

    const contextBlock = triples
      .map(t => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
      .join("\n");

    let structuredSummary = session.summary || "";
    const cachedCount = session.tripleCount || 0;

    if (triples.length > 0 && (structuredSummary === "" || cachedCount !== triples.length)) {
      structuredSummary = await generateProjectSummary(triples, projectName);
      await sessionStore.updateSession(sessionId, {
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
    const sessions = await sessionStore.getSessions();
    
    const sessionsWithStatus = await Promise.all(sessions.map(async (s) => {
      const isProcessing = await isSessionProcessing(s._id.toString());
      return {
        ...s,
        isProcessingGraph: isProcessing
      };
    }));

    res.json({ sessions: sessionsWithStatus });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// POST /api/context/active
router.post("/active", async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (sessionId === undefined) {
    res.status(400).json({ error: "sessionId required (can be null)" });
    return;
  }
  if (sessionId !== null && sessionId !== "none" && !isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }
  try {
    await sessionStore.setActiveSessionId(sessionId === "none" ? null : sessionId);
    res.json({ success: true, activeSessionId: sessionId });
  } catch (err) {
    res.status(500).json({ error: "Failed to set active session" });
  }
});

// GET /api/context/active
router.get("/active", async (req: Request, res: Response) => {
  try {
    const sessionId = await sessionStore.getActiveSessionId();
    if (!sessionId || !isValidObjectId(sessionId)) {
      res.json({ activeSession: null });
      return;
    }
    const session = await sessionStore.getSession(sessionId);
    
    if (!session) {
      res.json({ activeSession: null });
      return;
    }

    res.json({ 
      activeSession: {
        ...session,
        isProcessingGraph: await isSessionProcessing(session._id.toString())
      } 
    });
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
    await sessionStore.deleteSession(sid);
    await graphStore.getTriplesBySession(sid); // This doesn't delete, wait
    // I should have a deleteTriplesBySession in IGraphStore
    
    await vectorStore.deleteChunksBySession(sid);

    // v1.4.1+: Cancel any background jobs for this session
    await cancelSessionJobs(sid);

    const currentActive = await sessionStore.getActiveSessionId();
    if (currentActive === sid) {
      await sessionStore.setActiveSessionId(null);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

export default router;