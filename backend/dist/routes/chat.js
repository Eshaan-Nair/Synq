"use strict";
/**
 * chat.ts (backend route) — v1.2
 *
 * RAG pipeline change:
 * - splitIntoTopics (Groq) replaced with slidingWindowChunks (pure function)
 * - Nothing is filtered, nothing is lost — personal facts survive
 * - Graph extraction (extractTriples) is unchanged
 *
 * FullChat.topics now stores a lightweight preview of each chunk
 * (chunkIndex + first 120 chars) for display in the dashboard Chat tab.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const privacy_1 = require("../utils/privacy");
const chunker_1 = require("../services/chunker");
const chroma_1 = require("../services/chroma");
const extractor_1 = require("../services/extractor");
const neo4j_1 = require("../services/neo4j");
const mongo_1 = require("../services/mongo");
const logger_1 = require("../utils/logger");
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
function isValidObjectId(id) {
    return mongoose_1.default.Types.ObjectId.isValid(id);
}
// POST /api/chat/save
router.post("/save", async (req, res) => {
    const { rawText, sessionId, platform, messageCount } = req.body;
    if (!rawText || !sessionId) {
        res.status(400).json({ error: "rawText and sessionId are required" });
        return;
    }
    if (!isValidObjectId(sessionId)) {
        res.status(400).json({ error: "Invalid sessionId format" });
        return;
    }
    if (rawText.trim().length < 50) {
        res.status(400).json({ error: "Chat content too short to process (min 50 chars)" });
        return;
    }
    try {
        logger_1.logger.info(`Saving chat for session ${sessionId} (${rawText.length} chars)`);
        const cleanText = (0, privacy_1.scrubPII)(rawText);
        // ── RAG: Sliding window chunks (no Groq — nothing lost) ────────
        logger_1.logger.info("Chunking with sliding window...");
        const windowChunks = (0, chunker_1.slidingWindowChunks)(cleanText, sessionId);
        logger_1.logger.info(`Created ${windowChunks.length} window chunk(s)`);
        // Upsert FullChat — store raw text + lightweight chunk previews for the Chat tab
        await mongo_1.FullChat.findOneAndUpdate({ sessionId }, {
            sessionId,
            rawText: cleanText,
            // Store preview of each chunk for the dashboard Chat tab
            topics: windowChunks.map(c => ({
                name: `Chunk ${c.chunkIndex + 1}`,
                content: c.content.slice(0, 120) + (c.content.length > 120 ? "…" : ""),
                keywords: [],
            })),
            platform,
            messageCount: messageCount || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        }, { upsert: true, returnDocument: 'after' });
        // Store all window chunks in ChromaDB for RAG (non-fatal — Ollama may be down)
        let vectorsStored = false;
        try {
            await (0, chroma_1.storeWindowChunks)(windowChunks);
            vectorsStored = true;
        }
        catch (vecErr) {
            logger_1.logger.warn(`Vector storage failed (Ollama may be down): ${vecErr?.message || vecErr}`);
            logger_1.logger.warn("RAG recall will not work until Ollama is running. Chat data still saved.");
        }
        // ── Graph: Groq extraction pipeline (non-fatal — Groq may be rate-limited) ──
        let triplesCount = 0;
        try {
            logger_1.logger.info("Extracting triples for knowledge graph...");
            const triples = await (0, extractor_1.extractTriples)(cleanText);
            for (const t of triples) {
                await (0, neo4j_1.saveTriple)(t.subject, t.subjectType, t.relation, t.object, t.objectType, sessionId);
            }
            triplesCount = triples.length;
        }
        catch (graphErr) {
            logger_1.logger.warn(`Graph extraction failed (Groq may be down): ${graphErr?.message || graphErr}`);
            logger_1.logger.warn("Knowledge graph will not update. Chat data still saved.");
        }
        await mongo_1.Session.findByIdAndUpdate(sessionId, {
            updatedAt: new Date(),
            hasFullChat: true,
            topicCount: windowChunks.length,
            tripleCount: triplesCount,
        });
        const warnings = [];
        if (!vectorsStored)
            warnings.push("RAG vectors not stored (Ollama down)");
        if (triplesCount === 0)
            warnings.push("No triples extracted (Groq may be down)");
        logger_1.logger.success(`Chat saved: ${windowChunks.length} chunks, ${triplesCount} triples${warnings.length ? ` [${warnings.join(", ")}]` : ""}`);
        res.json({
            success: true,
            chunksStored: windowChunks.length,
            triplesExtracted: triplesCount,
            topicsExtracted: windowChunks.length,
            warnings: warnings.length > 0 ? warnings : undefined,
        });
    }
    catch (err) {
        logger_1.logger.error("Chat save error:", err);
        res.status(500).json({ error: "Failed to save chat" });
    }
});
// GET /api/chat/:sessionId
router.get("/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        const chat = await mongo_1.FullChat.findOne({ sessionId });
        if (!chat) {
            res.json({ found: false });
            return;
        }
        res.json({
            found: true,
            rawText: chat.rawText,
            topics: chat.topics,
            messageCount: chat.messageCount,
            topicCount: chat.topics?.length || 0,
            createdAt: chat.createdAt,
        });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to retrieve chat" });
    }
});
// DELETE /api/chat/:sessionId
router.delete("/:sessionId", async (req, res) => {
    const sessionId = req.params.sessionId;
    try {
        await mongo_1.FullChat.findOneAndDelete({ sessionId });
        await (0, chroma_1.deleteChunksBySession)(sessionId);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to delete chat" });
    }
});
exports.default = router;
