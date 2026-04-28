"use strict";
/**
 * chroma.ts — ChromaDB v2 REST API (v1.2)
 *
 * Updated: TopicChunk -> WindowChunk to match the new sliding window chunker.
 * Deduplication in retrieve now uses chunkIndex instead of topicName.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectChroma = connectChroma;
exports.storeWindowChunks = storeWindowChunks;
exports.storeTopicChunks = storeWindowChunks;
exports.retrieveRelevantChunks = retrieveRelevantChunks;
exports.deleteChunksBySession = deleteChunksBySession;
const axios_1 = __importDefault(require("axios"));
const embeddings_1 = require("./embeddings");
const logger_1 = require("../utils/logger");
const COLLECTION_NAME = "synq_chunks_v2";
const CHROMA_URL = (process.env.CHROMA_URL || "http://localhost:8000").replace(/\/$/, "");
const TENANT = "default_tenant";
const DATABASE = "default_database";
const COLL_BASE = `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}/collections`;
// Cosine similarity threshold — values are in [0, 1]
// nomic-embed-text with cosine: 0.5+ is a good match, 0.3+ is loosely related
const SIMILARITY_THRESHOLD = 0.30;
// Collection UUID assigned by server on creation
let collectionId = null;
// ── Connect ────────────────────────────────────────────────────────
async function connectChroma() {
    try {
        const res = await axios_1.default.post(COLL_BASE, {
            name: COLLECTION_NAME,
            get_or_create: true,
            // Use cosine similarity — works correctly with nomic-embed-text's 768-dim vectors
            // L2 distance gives values of 200-450 on these vectors, making exp(-dist) always ~0
            metadata: { "hnsw:space": "cosine" },
        });
        collectionId = res.data.id;
        logger_1.logger.success(`ChromaDB connected — collection "${COLLECTION_NAME}" (${collectionId})`);
    }
    catch (err) {
        logger_1.logger.error("ChromaDB connection failed:", err?.response?.data?.message || err?.message);
        logger_1.logger.warn("RAG features will be unavailable. Is ChromaDB running?");
        collectionId = null;
    }
}
// ── Store Window Chunks ────────────────────────────────────────────
async function storeWindowChunks(chunks) {
    if (!collectionId) {
        logger_1.logger.warn("ChromaDB not connected — skipping vector storage");
        return;
    }
    if (chunks.length === 0)
        return;
    // Delete any existing chunks for this session first (idempotent saves)
    try {
        const potentialIds = chunks.map(c => c.id);
        await axios_1.default.post(`${COLL_BASE}/${collectionId}/delete`, { ids: potentialIds });
        logger_1.logger.info(`Pre-cleared ${potentialIds.length} slot(s) for session ${chunks[0].sessionId}`);
    }
    catch (_) { /* ok — none existed yet */ }
    // Embed chunks in parallel
    const embeddings = await (0, embeddings_1.generateEmbeddings)(chunks.map(c => c.content));
    await axios_1.default.post(`${COLL_BASE}/${collectionId}/add`, {
        ids: chunks.map(c => c.id),
        embeddings,
        documents: chunks.map(c => c.content),
        metadatas: chunks.map(c => ({
            sessionId: c.sessionId,
            chunkIndex: c.chunkIndex,
            wordStart: c.wordStart,
            wordEnd: c.wordEnd,
        })),
    });
    logger_1.logger.success(`Stored ${chunks.length} window chunks in ChromaDB`);
}
async function retrieveRelevantChunks(query, sessionId, topN = 3) {
    if (!collectionId) {
        logger_1.logger.warn("ChromaDB not connected — returning empty context");
        return [];
    }
    const queryEmbedding = await (0, embeddings_1.generateEmbedding)(query);
    const fetchN = Math.max(topN * 4, 10); // over-fetch then filter
    const results = await axios_1.default.post(`${COLL_BASE}/${collectionId}/query`, {
        query_embeddings: [queryEmbedding],
        n_results: Math.min(fetchN, 100), // ChromaDB caps at collection size
        where: { sessionId },
        include: ["documents", "distances", "metadatas"],
    });
    const docs = results.data.documents?.[0] || [];
    const distances = results.data.distances?.[0] || [];
    const metadatas = results.data.metadatas?.[0] || [];
    if (docs.length === 0)
        return [];
    // Cosine similarity: ChromaDB returns values in [0, 1] (1 = identical)
    // No conversion needed — score IS the cosine similarity directly
    const scored = docs.map((doc, i) => ({
        chunkIndex: metadatas[i]?.chunkIndex ?? i,
        content: doc,
        score: 1 - (distances[i] ?? 1), // cosine distance → similarity
    }));
    // Filter by threshold, deduplicate (keep best score per chunk), sort by score
    const filtered = scored.filter(r => r.score >= SIMILARITY_THRESHOLD);
    const seen = new Map();
    for (const chunk of filtered) {
        const prev = seen.get(chunk.chunkIndex);
        if (!prev || chunk.score > prev.score)
            seen.set(chunk.chunkIndex, chunk);
    }
    return Array.from(seen.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
}
// ── Delete by session ──────────────────────────────────────────────
async function deleteChunksBySession(sessionId) {
    if (!collectionId)
        return;
    try {
        const res = await axios_1.default.post(`${COLL_BASE}/${collectionId}/get`, {
            where: { sessionId },
            include: [],
        });
        if (res.data?.ids?.length > 0) {
            await axios_1.default.post(`${COLL_BASE}/${collectionId}/delete`, { ids: res.data.ids });
            logger_1.logger.info(`Deleted ${res.data.ids.length} chunks for session ${sessionId}`);
        }
    }
    catch (err) {
        logger_1.logger.warn("Could not delete chunks from ChromaDB:", err);
    }
}
