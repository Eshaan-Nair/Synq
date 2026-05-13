import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { startWorker, clearAllJobs } from "./services/jobs";
import { initStorage } from "./services/storage";
import { logger } from "./utils/logger";
import contextRoutes from "./routes/context";
import graphRoutes from "./routes/graph";
import chatRoutes from "./routes/chat";
import ragRoutes from "./routes/rag";
import sessionRoutes from "./routes/session";
import jobsRoutes from "./routes/jobs";


// ── #9: .env validation — fail fast with a clear message ──────────
function validateEnv() {
  const STORAGE_MODE = (process.env.GLIA_STORAGE_MODE || "docker").toLowerCase();

  if (STORAGE_MODE === "docker") {
    // NEO4J, MONGO are only required in Docker mode
    const required: Record<string, string> = {
      NEO4J_URI: "e.g. bolt://localhost:7687",
      NEO4J_USER: "e.g. neo4j",
      NEO4J_PASSWORD: "Set in backend/.env",
      MONGO_URI: "e.g. mongodb://user:pass@localhost:27017/gliadb",
    };
    if (process.env.GRAPH_BACKEND === "groq") {
      required["GROQ_API_KEY"] = "Get a free key at https://console.groq.com";
    }
    const missing = Object.entries(required).filter(([k]) => !process.env[k]);
    if (missing.length > 0) {
      logger.error("Missing required environment variables for DOCKER mode:");
      missing.forEach(([k, hint]) => logger.error(`  ${k} — ${hint}`));
      logger.error("Set GLIA_STORAGE_MODE=sqlite to use Zero-Docker mode instead.");
      process.exit(1);
    }
  } else {
    // SQLite mode validation (minimal)
    if (process.env.GRAPH_BACKEND === "groq" && !process.env.GROQ_API_KEY) {
      logger.error("Missing GROQ_API_KEY for graph extraction.");
      process.exit(1);
    }
  }
}
validateEnv();

const app = express();
const PORT = process.env.PORT || 3001;

// Body parser — MUST be before routes. Raised limit for large chat saves.
app.use(express.json({ limit: "5mb" }));
// Issue #3 Fix: Restrict CORS to trusted origins only
// v1.4.7: Added localhost:3001 — dashboard is now served from the same port as the API
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`, // Dashboard (production build — v1.4.7)
  "http://localhost:3001",   // Default port fallback
  "http://localhost:5173",   // Vite dashboard (dev)
  "http://localhost:5174",   // Vite dashboard (dev alt)
  "http://localhost:4173",   // Vite dashboard (preview)
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (chrome-extension, Postman, curl)
    if (!origin) return callback(null, true);
    // Allow chrome-extension:// scheme
    if (origin.startsWith("chrome-extension://")) return callback(null, true);
    // Allow any localhost origin (with or without port)
    if (origin.includes("://localhost") || origin.includes("://127.0.0.1")) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-GLIA-Secret"],
}));
// Issue #13 Fix: Rate limiting to prevent abuse of the expensive LLM pipeline
// Global limiter: 200 requests per minute per IP across all endpoints
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down" },
});

// Strict limiter for the expensive /api/chat/save route (LLM + vector ops)
// 10 saves per minute is more than enough for normal usage
const saveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many save requests. Please wait before saving again." },
});

// #14: Security headers via helmet
app.use(helmet({ contentSecurityPolicy: false })); // CSP off — API-only server, no HTML

// v1.4.7: Auth middleware removed for better local-first UX

// Apply global rate limit across ALL routes (200 req/min per IP)
app.use(globalLimiter);

// Routes
app.use("/api/context", contextRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/chat/save", saveLimiter); // strict limit — BEFORE the route handler
app.use("/api/chat", chatRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/jobs", jobsRoutes);

// Health check — includes service status
app.get("/health", (_req, res) => {
  res.json({
    status: "GLIA backend running",
    version: "1.4.7",
    services: {
      backend: "ok",
      port: PORT,
    },
  });
});

// ── v1.4.6: Serve production dashboard build via sirv ─────────────
// Eliminates the separate Vite dev server process for self-hosters.
// Falls back gracefully with a clear message if the build hasn't run yet.
const dashboardDist = path.resolve(__dirname, "../../dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  // Lazy-require sirv so the backend still starts even if sirv isn't installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sirv = require("sirv");
    app.use("/", sirv(dashboardDist, { single: true, dev: false }));
    logger.success(`[GLIA] Dashboard served from production build: http://localhost:${PORT}`);
  } catch {
    logger.warn("[GLIA] sirv not installed — run: cd backend && npm install sirv");
  }
} else {
  logger.warn(
    `[GLIA] No dashboard build found at ${dashboardDist}. ` +
    "Run: cd dashboard && npm run build"
  );
}

async function start() {
  try {
    await initStorage();

    // Start background job worker for extraction tasks
    await startWorker();
  } catch (err) {
    logger.error("Fatal: Database connection failed. GLIA cannot start.");
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.success(`GLIA backend running on port ${PORT}`);
  });
}

start().catch(err => {
  logger.error("Unhandled error during startup:");
  logger.error(err);
  process.exit(1);
});
