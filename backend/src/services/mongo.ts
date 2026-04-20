import mongoose from "mongoose";

export async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

// Session schema — tracks each project/chat session
const sessionSchema = new mongoose.Schema({
  projectName: { type: String, required: true },
  platform: { type: String, enum: ["claude", "chatgpt", "gemini"] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  summary: { type: String },
  tripleCount: { type: Number, default: 0 },
});

export const Session = mongoose.model("Session", sessionSchema);