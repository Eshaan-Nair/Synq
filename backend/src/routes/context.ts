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
  const { projectName, platform, sessionId, externalChatId } = req.body;

  if (platform && !VALID_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` });
    return;
  }

  if (typeof projectName !== "string" || projectName.trim().length === 0) {
    res.status(400).json({ error: "projectName must be a non-empty string" });
    return;
  }

  try {
    // ── STEP 1: Identify the Session ─────────────────────────────────
    let targetSession: any = null;

    // A. Priority: Platform-specific Chat ID (Robust identity)
    if (externalChatId) {
      targetSession = await sessionStore.getSessionByExternalId(externalChatId);
      
      // CRITICAL FIX: If we have a Chat ID but it's NOT in our DB, 
      // we must treat this as a NEW chat. We ignore the sessionId 
      // because the popup might be sending a stale ID from a previous tab.
      if (!targetSession) {
        logger.info(`[GLIA] New Chat ID detected (${externalChatId}). Ignoring provided sessionId to prevent hijacking.`);
      }
    }

    // B. Fallback: Specific Glia Session ID (Only if we don't have a newer identity)
    if (!targetSession && sessionId && isValidObjectId(sessionId)) {
      targetSession = await sessionStore.getSession(sessionId);
    }

    // ── STEP 2: Handle Update vs Create ──────────────────────────────
    if (targetSession) {
      // It's an UPDATE. 
      // Check if the name they want to use is taken by ANOTHER session.
      const nameConflict = await sessionStore.getSessionByName(projectName.trim());
      if (nameConflict && nameConflict._id !== targetSession._id) {
        res.status(409).json({ error: `The name "${projectName}" is already taken by another project. Please choose a unique name.` });
        return;
      }

      await sessionStore.updateSession(targetSession._id, {
        projectName: projectName.trim(),
        platform: platform || targetSession.platform,
        externalChatId: externalChatId || targetSession.externalChatId
      });

      const updated = await sessionStore.getSession(targetSession._id);
      res.json({ sessionId: updated?._id, projectName: updated?.projectName });
    } else {
      // It's a NEW SAVE.
      // Check if the name is already taken globally.
      const nameConflict = await sessionStore.getSessionByName(projectName.trim());
      if (nameConflict) {
        res.status(409).json({ error: `A project named "${projectName}" already exists. Please choose a different name for this new chat.` });
        return;
      }

      const session = await sessionStore.createSession(projectName.trim(), platform || "unknown", externalChatId);
      res.json({ sessionId: session._id, projectName });
    }
  } catch (err) {
    logger.error("Session operation failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create/update session" });
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
