import { Router, Request, Response } from "express";
import { scrubPII } from "../utils/privacy";
import { extractTriples, generateProjectSummary } from "../services/extractor";
import { sessionStore, graphStore, vectorStore } from "../services/storage";
import { isSessionProcessing, cancelSessionJobs } from "../services/jobs";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";

const router = Router();

import { VALID_PLATFORMS } from "../utils/constants";

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
        tripleCount: (session.tripleCount || 0) + triples.length
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
  const { projectName, platform, sessionId } = req.body;
  if (!projectName) {
    res.status(400).json({ error: "projectName is required" });
    return;
  }

  if (platform && !VALID_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` });
    return;
  }

  if (typeof projectName !== "string" || projectName.trim().length === 0) {
    res.status(400).json({ error: "projectName must be a non-empty string" });
    return;
  }

  try {
    if (sessionId) {
      if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
      }
      await sessionStore.updateSession(sessionId, {
        projectName: projectName.trim(),
        platform
      });
      const updated = await sessionStore.getSession(sessionId);
      if (!updated) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json({ sessionId: updated._id, projectName: updated.projectName });
    } else {
      // SMART REUSE: Check if a session with this name already exists for this platform
      const existing = await sessionStore.getSessionByName(projectName.trim(), platform || "unknown");
      if (existing) {
        logger.info(`Reusing existing session found by name: ${projectName} (${existing._id})`);
        res.json({ sessionId: existing._id, projectName: existing.projectName });
        return;
      }

      const session = await sessionStore.createSession(projectName.trim(), platform || "unknown");
      res.json({ sessionId: session._id, projectName });
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
    const triples = await graphStore.getTriplesBySession(sessionId);
    const session = await sessionStore.getSession(sessionId);
    const projectName = session?.projectName || "Unknown Project";

    const contextBlock = triples
      .map(t => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
      .join("\n");

    let structuredSummary = session?.summary || "";
    const cachedCount = session?.tripleCount || 0;

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
      const isProcessing = await isSessionProcessing(s._id);
      return { ...s, isProcessingGraph: isProcessing };
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
  if (sessionId !== null && !isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }
  try {
    await sessionStore.setActiveSessionId(sessionId);
    res.json({ success: true, activeSessionId: sessionId });
  } catch (err) {
    res.status(500).json({ error: "Failed to set active session" });
  }
});

// GET /api/context/active
router.get("/active", async (req: Request, res: Response) => {
  try {
    const activeSessionId = await sessionStore.getActiveSessionId();
    if (!activeSessionId) {
      res.json({ activeSession: null });
      return;
    }
    const session = await sessionStore.getSession(activeSessionId);

    if (!session) {
      res.json({ activeSession: null });
      return;
    }

    res.json({
      activeSession: {
        ...session,
        isProcessingGraph: await isSessionProcessing(session._id)
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
    // Cancel background jobs for this session
    await cancelSessionJobs(sid);

    // Delete vectors
    try {
      await vectorStore.deleteChunksBySession(sid);
    } catch (err) {
      logger.warn("Could not delete vectors:", err);
    }

    // Delete session (cascades to full_chats and facts in SQLite)
    await sessionStore.deleteSession(sid);

    // Clear active session if it was this one
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
