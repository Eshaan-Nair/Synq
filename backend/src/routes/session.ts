import { Router, Request, Response } from "express";
import { sessionStore, vectorStore, graphStore } from "../services/storage";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";

const router = Router();

// GET /api/session/export/:id
router.get("/export/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || !isValidObjectId(id as string)) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }

  const sessionId = id as string;

  try {
    const session = await sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const fullChat = await sessionStore.getFullChat(sessionId);
    const facts = await graphStore.getTriplesBySession(sessionId);

    const exportData = {
      version: "1.4.7",
      timestamp: new Date().toISOString(),
      session,
      fullChat,
      facts
    };

    const safeName = (session.projectName || "session")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="ArcRift-${safeName}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    logger.error("Export error:", err);
    res.status(500).json({ error: "Failed to export session" });
  }
});

// POST /api/session/import
router.post("/import", async (req: Request, res: Response) => {
  const data = req.body;

  if (!data || !data.session) {
    res.status(400).json({ error: "Invalid import data" });
    return;
  }

  try {
    const { session, fullChat, facts } = data;

    // 1. Create session
    const newSession = await sessionStore.createSession(session.projectName, session.platform);
    const newId = newSession._id;

    // 2. Save full chat if exists
    if (fullChat) {
      await sessionStore.saveFullChat(newId, fullChat.rawText, fullChat.messageCount, fullChat.platform);
    }

    // 3. Save facts if exists
    if (facts && Array.isArray(facts)) {
      for (const f of facts) {
        await graphStore.saveTriple({
          subject: f.subject,
          subjectType: f.subjectType || "Entity",
          relation: f.relation,
          object: f.object,
          objectType: f.objectType || "Entity",
          sessionId: newId,
          timestamp: f.timestamp || new Date().toISOString()
        });
      }
    }

    logger.success(`Imported session: ${session.projectName} (New ID: ${newId})`);
    res.json({ success: true, sessionId: newId });
  } catch (err) {
    logger.error("Import error:", err);
    res.status(500).json({ error: "Failed to import session" });
  }
});

export default router;
