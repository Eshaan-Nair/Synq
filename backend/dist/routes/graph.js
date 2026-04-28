"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const neo4j_1 = require("../services/neo4j");
const logger_1 = require("../utils/logger");
const mongoose_1 = __importDefault(require("mongoose"));
function isValidObjectId(id) {
    return mongoose_1.default.Types.ObjectId.isValid(id);
}
const router = (0, express_1.Router)();
// GET /api/graph/all
// Returns all nodes + edges for D3 visualization
router.get("/all", async (req, res) => {
    const session = (0, neo4j_1.getDriver)().session();
    try {
        const result = await session.run(`
      MATCH (s:Entity)-[r:RELATION]->(o:Entity)
      RETURN s.name AS source, s.type AS sourceType,
             r.type AS relation,
             o.name AS target, o.type AS targetType
    `);
        const nodes = new Map();
        const links = [];
        result.records.forEach((rec) => {
            const src = rec.get("source");
            const tgt = rec.get("target");
            if (!nodes.has(src))
                nodes.set(src, { id: src, type: rec.get("sourceType") });
            if (!nodes.has(tgt))
                nodes.set(tgt, { id: tgt, type: rec.get("targetType") });
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
    }
    catch (err) {
        logger_1.logger.error("Graph /all query failed:", err);
        res.status(500).json({ error: "Failed to retrieve graph" });
    }
    finally {
        await session.close();
    }
});
// GET /api/graph/session/:sessionId
// Returns nodes + edges for a specific session only
router.get("/session/:sessionId", async (req, res) => {
    const sessionId = req.params.sessionId;
    // Issue #5 Fix: Validate sessionId format before querying Neo4j
    if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
    }
    const session = (0, neo4j_1.getDriver)().session();
    try {
        const result = await session.run(`
      MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity)
      RETURN s.name AS source, s.type AS sourceType,
             r.type AS relation,
             o.name AS target, o.type AS targetType
    `, { sessionId });
        const nodes = new Map();
        const links = [];
        result.records.forEach((rec) => {
            const src = rec.get("source");
            const tgt = rec.get("target");
            if (!nodes.has(src))
                nodes.set(src, { id: src, type: rec.get("sourceType") });
            if (!nodes.has(tgt))
                nodes.set(tgt, { id: tgt, type: rec.get("targetType") });
            links.push({ source: src, target: tgt, relation: rec.get("relation") });
        });
        res.json({ nodes: Array.from(nodes.values()), links });
    }
    catch (err) {
        logger_1.logger.error("Graph /session query failed:", err);
        res.status(500).json({ error: "Failed to retrieve session graph" });
    }
    finally {
        await session.close();
    }
});
exports.default = router;
