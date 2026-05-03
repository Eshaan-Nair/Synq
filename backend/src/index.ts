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
import { logger } from "./utils/logger";
import contextRoutes from "./routes/context";
import graphRoutes from "./routes/graph";
import chatRoutes from "./routes/chat";
import ragRoutes from "./routes/rag";

dotenv.config();

// ── #9: .env validation — fail fast with a clear message ──────────
function validateEnv() {
  // NEO4J, MONGO are always required
  const required: Record<string, string> = {
    NEO4J_URI:      "e.g. bolt://localhost:7687",
    NEO4J_USER:     "e.g. neo4j",
    NEO4J_PASSWORD: "Set in backend/.env",
    MONGO_URI:      "e.g. mongodb://user:pass@localhost:27017/synqdb",
  };
  // GROQ_API_KEY is only required when GRAPH_BACKEND is set to 'groq'
  // (or when Ollama is unavailable and auto-fallback kicks in at runtime)
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
// v1.4.0: Added localhost:3001 — dashboard is now served from the same port as the API
const ALLOWED_ORIGINS = [
  "http://localhost:3001",   // Dashboard (production build via sirv — v1.4.0)
  "http://localhost:5173",   // Vite dashboard (dev — legacy / still works)
  "http://localhost:5174",   // Vite dashboard (dev alternative)
  "http://localhost:4173",   // Vite dashboard (preview)
  "http://localhost:3000",   // alternative dev port
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
// Skip auth if SYNQ_SECRET is not configured (dev mode / first run)
const SYNQ_SECRET = process.env.SYNQ_SECRET;
if (SYNQ_SECRET) {
  app.use((req, res, next) => {
    // Skip health check so Docker / start scripts can probe without the secret
    if (req.path === "/health") return next();
    const provided = req.headers["x-synq-secret"];
    if (provided !== SYNQ_SECRET) {
      res.status(401).json({ error: "Unauthorized — invalid or missing X-SYNQ-Secret" });
      return;
    }
    next();
  });
  logger.info("Request auth enabled (X-SYNQ-Secret)");
} else {
  logger.warn("SYNQ_SECRET not set — request auth is disabled (dev mode)");
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
    version: "1.4.0",
    services: {
      backend: "ok",
      port: PORT,
    },
  });
});

// ── v1.4.0: Serve production dashboard build via sirv ─────────────
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

async function start() {
  await connectMongo();
  await connectNeo4j();
  await connectChroma(); // non-fatal if down

  app.listen(PORT, () => {
    logger.success(`SYNQ backend running on port ${PORT}`);
  });
}

start();