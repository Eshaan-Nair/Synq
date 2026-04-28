"use strict";
// Generates vector embeddings using Ollama (local, free, no rate limits)
// Model: nomic-embed-text (runs on CPU, ~500MB)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
exports.generateEmbeddings = generateEmbeddings;
exports.checkOllamaHealth = checkOllamaHealth;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBED_MODEL = "nomic-embed-text";
async function generateEmbedding(text) {
    try {
        const response = await axios_1.default.post(`${OLLAMA_URL}/api/embeddings`, {
            model: EMBED_MODEL,
            prompt: text,
        });
        return response.data.embedding;
    }
    catch (err) {
        logger_1.logger.error("Embedding generation failed:", err?.message);
        throw new Error("Ollama embedding failed. Is Ollama running? Run: ollama serve");
    }
}
// Issue #6 Fix: Generate embeddings in parallel instead of sequentially.
// Previously, 10 topics = 10 sequential HTTP calls (slow).
// Now all embeddings are fired concurrently and awaited together.
async function generateEmbeddings(texts) {
    return Promise.all(texts.map(text => generateEmbedding(text)));
}
async function checkOllamaHealth() {
    try {
        await axios_1.default.get(`${OLLAMA_URL}/api/tags`);
        return true;
    }
    catch {
        return false;
    }
}
