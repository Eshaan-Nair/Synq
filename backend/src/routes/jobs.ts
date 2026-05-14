import { Router, Request, Response } from "express";
import { sessionStore } from "../services/storage";
import { clearAllJobs } from "../services/jobs";

const router = Router();

// GET /api/jobs/status
// Global queue status
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await sessionStore.getJobStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

// GET /api/jobs/status/:sessionId
// Session-specific status
router.get("/status/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const status = await sessionStore.getJobStatusBySession(sessionId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

// POST /api/jobs/clear
// Clears all jobs (emergency use from dashboard)
router.post("/clear", async (_req: Request, res: Response) => {
  try {
    await clearAllJobs();
    res.json({ success: true, message: "Job queue cleared" });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear jobs" });
  }
});

export default router;
