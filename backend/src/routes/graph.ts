import { Router, Request, Response } from "express";
import { getDriver } from "../services/neo4j";
import { logger } from "../utils/logger";
import mongoose from "mongoose";

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

const router = Router();

// GET /api/graph/all
// Returns all nodes + edges for D3 visualization
router.get("/all", async (req: Request, res: Response) => {
  const session = getDriver().session();
  try {
    const result = await session.run(`
      MATCH (s:Entity)-[r:RELATION]->(o:Entity)
      RETURN s.name AS source, s.type AS sourceType,
             r.type AS relation,
             o.name AS target, o.type AS targetType
      LIMIT 500
    `);

    const nodes = new Map<string, object>();
    const links: object[] = [];

    result.records.forEach((rec) => {
      const src = rec.get("source");
      const tgt = rec.get("target");

      if (!nodes.has(src)) nodes.set(src, { id: src, type: rec.get("sourceType") });
      if (!nodes.has(tgt)) nodes.set(tgt, { id: tgt, type: rec.get("targetType") });

      links.push({
        source: src,
        target: tgt,
        relation: rec.get("relation"),
      });
    });

    res.json({
      nodes: Array.from(nodes.values()),
      links,
    });
  } catch (err) {
    logger.error("Graph /all query failed:", err);
    res.status(500).json({ error: "Failed to retrieve graph" });
  } finally {
    await session.close();
  }
});

// GET /api/graph/session/:sessionId
// Returns nodes + edges for a specific session only
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  // Issue #5 Fix: Validate sessionId format before querying Neo4j
  if (!isValidObjectId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  const session = getDriver().session();
  try {
    const result = await session.run(`
      MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity)
      RETURN s.name AS source, s.type AS sourceType,
             r.type AS relation,
             o.name AS target, o.type AS targetType
    `, { sessionId });

    const nodes = new Map<string, object>();
    const links: object[] = [];

    result.records.forEach((rec) => {
      const src = rec.get("source");
      const tgt = rec.get("target");
      if (!nodes.has(src)) nodes.set(src, { id: src, type: rec.get("sourceType") });
      if (!nodes.has(tgt)) nodes.set(tgt, { id: tgt, type: rec.get("targetType") });
      links.push({ source: src, target: tgt, relation: rec.get("relation") });
    });

    res.json({ nodes: Array.from(nodes.values()), links });
  } catch (err) {
    logger.error("Graph /session query failed:", err);
    res.status(500).json({ error: "Failed to retrieve session graph" });
  } finally {
    await session.close();
  }
});

export default router;