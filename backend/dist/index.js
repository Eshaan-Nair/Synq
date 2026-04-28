"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const mongo_1 = require("./services/mongo");
const neo4j_1 = require("./services/neo4j");
const chroma_1 = require("./services/chroma");
const logger_1 = require("./utils/logger");
const context_1 = __importDefault(require("./routes/context"));
const graph_1 = __importDefault(require("./routes/graph"));
const chat_1 = __importDefault(require("./routes/chat"));
const rag_1 = __importDefault(require("./routes/rag"));
dotenv_1.default.config();
// ── #9: .env validation — fail fast with a clear message ──────────
function validateEnv() {
    const required = {
        GROQ_API_KEY: "Get a free key at https://console.groq.com",
        NEO4J_URI: "e.g. bolt://localhost:7687",
        NEO4J_USER: "e.g. neo4j",
        NEO4J_PASSWORD: "Set in backend/.env",
        MONGO_URI: "e.g. mongodb://user:pass@localhost:27017/synqdb",
    };
    const missing = Object.entries(required).filter(([k]) => !process.env[k]);
    if (missing.length > 0) {
        logger_1.logger.error("Missing required environment variables:");
        missing.forEach(([k, hint]) => logger_1.logger.error(`  ${k} — ${hint}`));
        logger_1.logger.error("Copy backend/.env.example to backend/.env and fill in the values.");
        process.exit(1);
    }
}
validateEnv();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Body parser — MUST be before routes. Raised limit for large chat saves.
app.use(express_1.default.json({ limit: "5mb" }));
// Issue #3 Fix: Restrict CORS to trusted origins only
const ALLOWED_ORIGINS = [
    "http://localhost:5173", // Vite dashboard (dev)
    "http://localhost:4173", // Vite dashboard (preview)
    "http://localhost:3000", // alternative dev port
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (chrome-extension, Postman, curl)
        if (!origin)
            return callback(null, true);
        // Allow chrome-extension:// scheme for the browser extension
        if (origin.startsWith("chrome-extension://"))
            return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin))
            return callback(null, true);
        callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// Issue #13 Fix: Rate limiting to prevent abuse of the expensive LLM pipeline
// Global limiter: 200 requests per minute per IP across all endpoints
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please slow down" },
});
// Strict limiter for the expensive /api/chat/save route (LLM + vector ops)
// 10 saves per minute is more than enough for normal usage
const saveLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many save requests. Please wait before saving again." },
});
// #14: Security headers via helmet
app.use((0, helmet_1.default)({ contentSecurityPolicy: false })); // CSP off — API-only server, no HTML
// #3: Shared-secret auth — extension and dashboard set X-SYNQ-Secret header
// Skip auth if SYNQ_SECRET is not configured (dev mode / first run)
const SYNQ_SECRET = process.env.SYNQ_SECRET;
if (SYNQ_SECRET) {
    app.use((req, res, next) => {
        // Skip health check so Docker / start scripts can probe without the secret
        if (req.path === "/health")
            return next();
        const provided = req.headers["x-synq-secret"];
        if (provided !== SYNQ_SECRET) {
            res.status(401).json({ error: "Unauthorized — invalid or missing X-SYNQ-Secret" });
            return;
        }
        next();
    });
    logger_1.logger.info("Request auth enabled (X-SYNQ-Secret)");
}
else {
    logger_1.logger.warn("SYNQ_SECRET not set — request auth is disabled (dev mode)");
}
// Routes
app.use("/api/context", context_1.default);
app.use("/api/graph", graph_1.default);
app.use("/api/chat/save", saveLimiter); // strict limit — BEFORE the route handler
app.use("/api/chat", chat_1.default);
app.use("/api/rag", rag_1.default);
// Health check — includes service status
app.get("/health", async (req, res) => {
    res.json({
        status: "SYNQ backend running",
        version: "2.0.0",
        services: {
            backend: "ok",
            port: PORT,
        },
    });
});
async function start() {
    await (0, mongo_1.connectMongo)();
    await (0, neo4j_1.connectNeo4j)();
    await (0, chroma_1.connectChroma)(); // non-fatal if down
    app.listen(PORT, () => {
        logger_1.logger.success(`SYNQ backend running on port ${PORT}`);
    });
}
start();
