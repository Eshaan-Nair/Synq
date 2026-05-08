import { Router, Request, Response } from "express";
import { graphStore } from "../services/storage";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";

const router = Router();

// GET /api/graph/all
// Returns all nodes + edges for D3 visualization
router.get("/all", async (req: Request, res: Response) => {
  const { sessionId, limit = "200" } = req.query;
  const cap = Math.min(parseInt(limit as string) || 200, 500);

  try {
    const filters: any = { limit: cap };
    if (sessionId && typeof sessionId === "string" && isValidObjectId(sessionId)) {
      filters.sessionId = sessionId;
    }

    const data = await graphStore.getGraphData(filters);

    res.json({
      ...data,
      truncated: data.links.length >= cap,
    });
  } catch (err) {
    logger.error("Graph /all query failed:", err);
    res.status(500).json({ error: "Failed to retrieve graph" });
  }
});

// GET /api/graph/session/:sessionId
// Returns nodes + edges for a specific session only
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  const { type, relation } = req.query;
  try {
    const filters: any = { sessionId };
    if (type && typeof type === "string") filters.type = type;
    if (relation && typeof relation === "string") filters.relation = relation;

    const data = await graphStore.getGraphData(filters);

    res.json(data);
  } catch (err) {
    logger.error("Graph /session query failed:", err);
    res.status(500).json({ error: "Failed to retrieve session graph" });
  }
});

export default router;
