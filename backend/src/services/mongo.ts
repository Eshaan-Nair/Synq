import mongoose from "mongoose";
import { logger } from "../utils/logger";

export async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    logger.success("MongoDB connected");
  } catch (err) {
    logger.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

// ── Session schema ───────────────────────────────────────────────
const sessionSchema = new mongoose.Schema({
  projectName: { type: String, required: true },
  platform: { type: String, enum: ["claude", "chatgpt", "gemini", "deepseek", "grok", "copilot", "mistral", "mcp"] },
  summary: { type: String },          // cached project summary (avoids re-calling Groq on every read)
  tripleCount: { type: Number, default: 0 },
  // NEW: whether a full chat has been saved for RAG
  hasFullChat: { type: Boolean, default: false },
  topicCount: { type: Number, default: 0 },
}, { timestamps: true });

export const Session = mongoose.model("Session", sessionSchema);

// ── Full chat storage schema ─────────────────────────────────────
const fullChatSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  rawText: { type: String, required: true },       // full chat verbatim
  topics: [{
    name: { type: String },
    content: { type: String },
    keywords: [{ type: String }],
  }],
  platform: { type: String },
  messageCount: { type: Number, default: 0 },
}, { timestamps: true });

export const FullChat = mongoose.model("FullChat", fullChatSchema);

// ── Active session singleton ─────────────────────────────────────
const activeSessionSchema = new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  sessionId: { type: String, default: null },
});

export const ActiveSessionModel =
  mongoose.models.ActiveSession ||
  mongoose.model("ActiveSession", activeSessionSchema);

export async function getActiveSessionId(): Promise<string | null> {
  const doc = await ActiveSessionModel.findById("singleton");
  return doc?.sessionId ?? null;
}

export async function setActiveSessionId(sessionId: string | null): Promise<void> {
  // Use `returnDocument: 'after'` instead, which is the correct Mongoose option.
  await ActiveSessionModel.findByIdAndUpdate(
    "singleton",
    { sessionId },
    { upsert: true, returnDocument: 'after' }
  );
}

// ── Job queue schema ──────────────────────────────────────────────
const jobSchema = new mongoose.Schema({
  type: { type: String, enum: ["triple_extraction"], required: true },
  payload: { type: Object, required: true },
  status: { type: String, enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"], default: "PENDING" },
  deadLettered: { type: Boolean, default: false },
  failedAt: { type: Date },
  error: { type: String },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

// Index for the worker to find pending jobs quickly
jobSchema.index({ status: 1, createdAt: 1 });
// Index for checking session-specific processing status
jobSchema.index({ "payload.sessionId": 1, status: 1 });

export const Job = mongoose.model("Job", jobSchema);
