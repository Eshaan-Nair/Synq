import { Router, Request, Response } from "express";
import { graphStore, vectorStore, sessionStore } from "../services/storage";
import { logger } from "../utils/logger";
import { isValidObjectId } from "../utils/validators";
import { prune } from "../mcp/tools/prune";

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

// POST /api/graph/prune
// Exposes the prune_memory MCP tool logic to the dashboard
router.post("/prune", async (req: Request, res: Response) => {
  const { prompt, nodeId, sessionId } = req.body;
  
  if (nodeId) {
    try {
      const factsDeleted = await graphStore.deleteTriples([nodeId], sessionId);
      const chunksDeleted = await vectorStore.deleteChunksByQuery(nodeId, sessionId);
      if (sessionId) {
        const session = await sessionStore.getSession(sessionId);
        if (session) {
          await sessionStore.updateSession(sessionId, {
            tripleCount: Math.max(0, (session.tripleCount || 0) - factsDeleted),
            updatedAt: new Date()
          });
        }
      }
      res.json({ success: true, message: `Deleted ${nodeId}` });
    } catch (err) {
      logger.error("Graph node deletion failed:", err);
      res.status(500).json({ error: "Failed to delete node" });
    }
    return;
  }

  if (!prompt) {
    res.status(400).json({ error: "prompt or nodeId is required" });
    return;
  }

  try {
    const result = await prune(prompt, sessionId);
    if (result.includes("failed:") || result.includes("Could not identify")) {
      res.status(400).json({ error: result });
      return;
    }
    res.json({ success: true, message: result });
  } catch (err) {
    logger.error("Graph prune failed:", err);
    res.status(500).json({ error: "Failed to prune graph node" });
  }
});

export default router;
