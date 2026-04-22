import { Router, Request, Response } from "express";
import { getDriver } from "../services/neo4j";

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
  } finally {
    await session.close();
  }
});

// GET /api/graph/session/:sessionId
// Returns nodes + edges for a specific session only
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  const session = getDriver().session();
  try {
    const result = await session.run(`
      MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity)
      RETURN s.name AS source, s.type AS sourceType,
             r.type AS relation,
             o.name AS target, o.type AS targetType
    `, { sessionId: req.params.sessionId });

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
  } finally {
    await session.close();
  }
});

export default router;