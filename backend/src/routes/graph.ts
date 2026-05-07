import { Router, Request, Response } from "express";
import { graphStore } from "../services/storage";
import { isValidObjectId } from "../utils/validators";

const router = Router();

// GET /api/graph/data
router.get("/data", async (req: Request, res: Response) => {
  const { sessionId, type, relation, limit } = req.query;

  if (sessionId && typeof sessionId === "string" && !isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  try {
    const filters = {
      sessionId: sessionId as string,
      type: type as string,
      relation: relation as string,
      limit: limit ? parseInt(limit as string) : undefined
    };

    const data = await graphStore.getGraphData(filters);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch graph data" });
  }
});

// GET /api/graph/triples/:sessionId
router.get("/triples/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  try {
    const triples = await graphStore.getTriplesBySession(sessionId);
    res.json({ triples });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch triples" });
  }
});

export default router;