"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActiveSessionModel = exports.FullChat = exports.Session = void 0;
exports.connectMongo = connectMongo;
exports.getActiveSessionId = getActiveSessionId;
exports.setActiveSessionId = setActiveSessionId;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../utils/logger");
async function connectMongo() {
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI);
        logger_1.logger.success("MongoDB connected");
    }
    catch (err) {
        logger_1.logger.error("MongoDB connection failed:", err);
        process.exit(1);
    }
}
// ── Session schema ───────────────────────────────────────────────
const sessionSchema = new mongoose_1.default.Schema({
    projectName: { type: String, required: true },
    platform: { type: String, enum: ["claude", "chatgpt", "gemini"] },
    summary: { type: String }, // cached project summary (avoids re-calling Groq on every read)
    tripleCount: { type: Number, default: 0 },
    // NEW: whether a full chat has been saved for RAG
    hasFullChat: { type: Boolean, default: false },
    topicCount: { type: Number, default: 0 },
}, { timestamps: true });
exports.Session = mongoose_1.default.model("Session", sessionSchema);
// ── Full chat storage schema ─────────────────────────────────────
const fullChatSchema = new mongoose_1.default.Schema({
    sessionId: { type: String, required: true, index: true },
    rawText: { type: String, required: true }, // full chat verbatim
    topics: [{
            name: { type: String },
            content: { type: String },
            keywords: [{ type: String }],
        }],
    platform: { type: String },
    messageCount: { type: Number, default: 0 },
}, { timestamps: true });
exports.FullChat = mongoose_1.default.model("FullChat", fullChatSchema);
// ── Active session singleton ─────────────────────────────────────
const activeSessionSchema = new mongoose_1.default.Schema({
    _id: { type: String, default: "singleton" },
    sessionId: { type: String, default: null },
});
exports.ActiveSessionModel = mongoose_1.default.models.ActiveSession ||
    mongoose_1.default.model("ActiveSession", activeSessionSchema);
async function getActiveSessionId() {
    const doc = await exports.ActiveSessionModel.findById("singleton");
    return doc?.sessionId ?? null;
}
async function setActiveSessionId(sessionId) {
    // Use `returnDocument: 'after'` instead, which is the correct Mongoose option.
    await exports.ActiveSessionModel.findByIdAndUpdate("singleton", { sessionId }, { upsert: true, returnDocument: 'after' });
}
