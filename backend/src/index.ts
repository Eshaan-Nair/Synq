import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
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
  const required: Record<string, string> = {
    GROQ_API_KEY: "Get a free key at https://console.groq.com",
    NEO4J_URI:    "e.g. bolt://localhost:7687",
    NEO4J_USER:   "e.g. neo4j",
    NEO4J_PASSWORD: "Set in backend/.env",
    MONGO_URI:    "e.g. mongodb://user:pass@localhost:27017/synqdb",
  };
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
const ALLOWED_ORIGINS = [
  "http://localhost:5173",   // Vite dashboard (dev)
  "http://localhost:4173",   // Vite dashboard (preview)
  "http://localhost:3000",   // alternative dev port
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (chrome-extension, Postman, curl)
    if (!origin) return callback(null, true);
    // Allow chrome-extension:// scheme for the browser extension
    if (origin.startsWith("chrome-extension://")) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
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
    version: "1.3.0",
    services: {
      backend: "ok",
      port: PORT,
    },
  });
});

async function start() {
  await connectMongo();
  await connectNeo4j();
  await connectChroma(); // non-fatal if down

  app.listen(PORT, () => {
    logger.success(`SYNQ backend running on port ${PORT}`);
  });
}

start();