import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { connectMongo } from "./services/mongo";
import { connectNeo4j } from "./services/neo4j";
import { connectChroma } from "./services/chroma";
import { startWorker, clearAllJobs } from "./services/jobs";
import { logger } from "./utils/logger";
import contextRoutes from "./routes/context";
import graphRoutes from "./routes/graph";
import chatRoutes from "./routes/chat";
import ragRoutes from "./routes/rag";

dotenv.config();

const STORAGE_MODE = (process.env.SYNQ_STORAGE_MODE || "docker").toLowerCase();
const IS_SQLITE = STORAGE_MODE === "sqlite";

// ── .env validation — fail fast with a clear message ──────────
function validateEnv() {
  const required: Record<string, string> = {};
  
  if (!IS_SQLITE) {
    required["NEO4J_URI"] = "e.g. bolt://localhost:7687";
    required["NEO4J_USER"] = "e.g. neo4j";
    required["NEO4J_PASSWORD"] = "Set in backend/.env";
    required["MONGO_URI"] = "e.g. mongodb://user:pass@localhost:27017/synqdb";
  }

  if (process.env.GRAPH_BACKEND === "groq") {
    required["GROQ_API_KEY"] = "Get a free key at https://console.groq.com";
  }
  const missing = Object.entries(required).filter(([k]) => !process.env[k]);
  if (missing.length > 0) {
    logger.error("Missing required environment variables:");
    missing.forEach(([k, hint]) => logger.error(`  ${k} — ${hint}`));
    logger.error("Copy backend/.env.example to backend/.env and fill in the values.");
    process.exit(1);
  }
}
validateEnv();

const app = express();
const PORT = process.env.PORT || 3001;

// Body parser — MUST be before routes. Raised limit for large chat saves.
app.use(express.json({ limit: "5mb" }));
// Issue #3 Fix: Restrict CORS to trusted origins only
// v1.4.1: Added localhost:3001 — dashboard is now served from the same port as the API
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`, // Dashboard (production build — v1.4.1)
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
  allowedHeaders: ["Content-Type", "Authorization", "X-SYNQ-Secret"],
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

// #3: Shared-secret auth — extension and dashboard set X-SYNQ-Secret header
// Flip the default to secure — require an explicit SYNQ_NO_AUTH=true to disable
const SYNQ_SECRET = process.env.SYNQ_SECRET;
const NO_AUTH = process.env.SYNQ_NO_AUTH === "true";

if (NO_AUTH) {
  logger.warn("SYNQ_NO_AUTH=true — request auth is disabled (dev mode)");
} else if (SYNQ_SECRET) {
  app.use((req, res, next) => {
    // Only enforce auth on API routes. Static dashboard assets and health check are public.
    if (!req.path.startsWith("/api") || req.path === "/health") return next();
    
    const provided = req.headers["x-synq-secret"];
    if (provided !== SYNQ_SECRET) {
      logger.warn(`Auth failed: provided=${String(provided).slice(0, 4)}... expected=${String(SYNQ_SECRET).slice(0, 4)}...`);
      res.status(401).json({ error: "Unauthorized — invalid or missing X-SYNQ-Secret" });
      return;
    }
    next();
  });
  logger.info("Request auth enabled (X-SYNQ-Secret) for /api/*");
} else {
  // Runtime fallback — generate a temporary secret to avoid locking users out
  const crypto = require("crypto");
  const autoSecret = crypto.randomBytes(32).toString("base64");
  process.env.SYNQ_SECRET = autoSecret;
  
  logger.warn(
    `SYNQ_SECRET not found in .env — generated a temporary one for this session. ` +
    `Add SYNQ_SECRET=${autoSecret} to backend/.env to make it permanent.`
  );

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api") || req.path === "/health") return next();
    
    const provided = req.headers["x-synq-secret"];
    if (provided !== autoSecret) {
      res.status(401).json({ error: "Unauthorized — invalid or missing X-SYNQ-Secret" });
      return;
    }
    next();
  });
}

// Apply global rate limit across ALL routes (200 req/min per IP)
app.use(globalLimiter);

// Routes
app.use("/api/context", contextRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/chat/save", saveLimiter); // strict limit — BEFORE the route handler
app.use("/api/chat", chatRoutes);
app.use("/api/rag", ragRoutes);

// Health check — includes service status
app.get("/health", (_req, res) => {
  res.json({
    status: "SYNQ backend running",
    version: "1.4.1",
    services: {
      backend: "ok",
      port: PORT,
    },
  });
});

// ── v1.4.1: Serve production dashboard build via sirv ─────────────
// Eliminates the separate Vite dev server process for self-hosters.
// Falls back gracefully with a clear message if the build hasn't run yet.
const dashboardDist = path.resolve(__dirname, "../../dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  // Lazy-require sirv so the backend still starts even if sirv isn't installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sirv = require("sirv");
    app.use("/", sirv(dashboardDist, { single: true, dev: false }));
    logger.success(`[SYNQ] Dashboard served from production build → http://localhost:${PORT}`);
  } catch {
    logger.warn("[SYNQ] sirv not installed — run: cd backend && npm install sirv");
  }
} else {
  logger.warn(
    `[SYNQ] No dashboard build found at ${dashboardDist}. ` +
    "Run: cd dashboard && npm run build"
  );
}

app.post("/api/jobs/clear", async (req, res) => {
  await clearAllJobs();
  res.json({ success: true, message: "Job queue cleared" });
});

async function main() {
  try {
    if (IS_SQLITE) {
      const { initSqlite } = require("./services/sqlite");
      initSqlite();
    } else {
      await connectMongo();
      await connectChroma();
      await connectNeo4j();
    }
  } catch (err) {
    logger.error("Database connection failed:", err);
    // Non-fatal — routes that need the DB will handle errors
  }

  app.listen(PORT, () => {
    logger.success(`SYNQ backend running on port ${PORT}`);
    startWorker(); // Start the background extraction worker
  });
}

main().catch(err => {
  logger.error("Unhandled error during startup:");
  logger.error(err);
  process.exit(1);
});