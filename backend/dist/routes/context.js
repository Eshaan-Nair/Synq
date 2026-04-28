"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const privacy_1 = require("../utils/privacy");
const extractor_1 = require("../services/extractor");
const neo4j_1 = require("../services/neo4j");
const mongo_1 = require("../services/mongo");
const logger_1 = require("../utils/logger");
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
// Issue #5 Fix: Validate that a sessionId string is a valid MongoDB ObjectId
function isValidObjectId(id) {
    return mongoose_1.default.Types.ObjectId.isValid(id);
}
// POST /api/context/ingest
router.post("/ingest", async (req, res) => {
    const { text, sessionId, platform } = req.body;
    if (!text || !sessionId) {
        res.status(400).json({ error: "text and sessionId are required" });
        return;
    }
    // Issue #5 Fix: validate text length to prevent trivial/empty ingests
    if (typeof text !== "string" || text.trim().length < 10) {
        res.status(400).json({ error: "text must be at least 10 characters" });
        return;
    }
    if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
    }
    try {
        const cleanText = (0, privacy_1.scrubPII)(text);
        const triples = await (0, extractor_1.extractTriples)(cleanText);
        for (const t of triples) {
            await (0, neo4j_1.saveTriple)(t.subject, t.subjectType, t.relation, t.object, t.objectType, sessionId);
        }
        await mongo_1.Session.findByIdAndUpdate(sessionId, {
            updatedAt: new Date(),
            $inc: { tripleCount: triples.length },
        });
        res.json({ success: true, triplesExtracted: triples.length, triples });
    }
    catch (err) {
        logger_1.logger.error("Ingest error:", err);
        res.status(500).json({ error: "Failed to process context" });
    }
});
// POST /api/context/session
router.post("/session", async (req, res) => {
    const { projectName, platform } = req.body;
    if (!projectName) {
        res.status(400).json({ error: "projectName is required" });
        return;
    }
    // Issue #5 Fix: validate platform enum
    const VALID_PLATFORMS = ["claude", "chatgpt", "gemini"];
    if (platform && !VALID_PLATFORMS.includes(platform)) {
        res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` });
        return;
    }
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
        res.status(400).json({ error: "projectName must be a non-empty string" });
        return;
    }
    try {
        const session = await mongo_1.Session.create({ projectName: projectName.trim(), platform });
        res.json({ sessionId: session._id, projectName });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to create session" });
    }
});
// GET /api/context/retrieve/:sessionId
router.get("/retrieve/:sessionId", async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
    }
    try {
        const triples = await (0, neo4j_1.getTriplesBySession)(sessionId);
        const session = await mongo_1.Session.findById(sessionId).select("projectName summary tripleCount");
        const projectName = session?.projectName || "Unknown Project";
        const contextBlock = triples
            .map(t => `(${t.subjectType}:${t.subject}) -[${t.relation}]-> (${t.objectType}:${t.object})`)
            .join("\n");
        // Issue #24 Fix: Use cached summary if it exists and triples haven't changed.
        // Only regenerate if the cached count doesn't match current triples.
        let structuredSummary = session?.summary || "";
        const cachedCount = session?.tripleCount || 0;
        if (triples.length > 0 && (structuredSummary === "" || cachedCount !== triples.length)) {
            structuredSummary = await (0, extractor_1.generateProjectSummary)(triples, projectName);
            // Persist the newly generated summary and update the count
            await mongo_1.Session.findByIdAndUpdate(sessionId, {
                summary: structuredSummary,
                tripleCount: triples.length,
            });
        }
        res.json({ sessionId, tripleCount: triples.length, contextBlock, structuredSummary, triples });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to retrieve context" });
    }
});
// GET /api/context/sessions
router.get("/sessions", async (req, res) => {
    try {
        const sessions = await mongo_1.Session.find()
            .sort({ updatedAt: -1 })
            .select("_id projectName platform tripleCount topicCount hasFullChat createdAt updatedAt");
        res.json({ sessions });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch sessions" });
    }
});
// POST /api/context/active
router.post("/active", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        res.status(400).json({ error: "sessionId required" });
        return;
    }
    if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
    }
    try {
        await (0, mongo_1.setActiveSessionId)(sessionId);
        res.json({ success: true, activeSessionId: sessionId });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to set active session" });
    }
});
// GET /api/context/active
router.get("/active", async (req, res) => {
    try {
        const activeSessionId = await (0, mongo_1.getActiveSessionId)();
        if (!activeSessionId) {
            res.json({ activeSession: null });
            return;
        }
        const session = await mongo_1.Session.findById(activeSessionId)
            .select("_id projectName platform tripleCount topicCount");
        res.json({ activeSession: session || null });
    }
    catch {
        res.json({ activeSession: null });
    }
});
// DELETE /api/context/session/:sessionId
router.delete("/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const sid = sessionId;
    if (!isValidObjectId(sid)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
    }
    try {
        await mongo_1.Session.findByIdAndDelete(sid);
        const { getDriver } = await Promise.resolve().then(() => __importStar(require("../services/neo4j")));
        const neo4jSession = getDriver().session();
        try {
            await neo4jSession.run(`MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity) DELETE r`, { sessionId: sid });
        }
        finally {
            await neo4jSession.close();
        }
        // Delete full chat and vectors
        try {
            const { FullChat } = await Promise.resolve().then(() => __importStar(require("../services/mongo")));
            const { deleteChunksBySession } = await Promise.resolve().then(() => __importStar(require("../services/chroma")));
            await FullChat.findOneAndDelete({ sessionId: sid });
            await deleteChunksBySession(sid);
        }
        catch (err) {
            logger_1.logger.warn("Could not delete chat/vectors:", err);
        }
        const currentActive = await (0, mongo_1.getActiveSessionId)();
        if (currentActive === sid) {
            await (0, mongo_1.setActiveSessionId)(null);
        }
        res.json({ success: true });
    }
    catch (err) {
        logger_1.logger.error("Delete error:", err);
        res.status(500).json({ error: "Failed to delete session" });
    }
});
exports.default = router;
