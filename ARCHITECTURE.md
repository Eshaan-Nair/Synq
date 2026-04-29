# SYNQ — Architecture

## Overview

SYNQ has three layers that work together:

1. **Chrome Extension** — scrapes AI conversations, intercepts prompts, injects context
2. **Node.js Backend** — processes text, orchestrates services, handles RAG retrieval
3. **React Dashboard** — visualizes the knowledge graph, manages sessions

---

## Security Model

All security controls are enforced in the backend (`src/index.ts`):

| Control | Implementation | Value |
|---|---|---|
| CORS | Explicit origin allowlist | `localhost:5173`, `localhost:4173`, `chrome-extension://` only |
| Rate limiting | express-rate-limit | 200 req/min global; 10 req/min on `/api/chat/save` |
| Input validation | All routes | `sessionId` as valid MongoDB ObjectId; `platform` as enum; text length minimum |
| Body limit | express.json | 5MB cap — prevents trivial DoS on the save endpoint |
| Security headers | helmet | All standard headers; CSP disabled (API-only, no HTML served) |
| PII scrubbing | `src/utils/privacy.ts` | Runs client-side before transmission; catches JWTs, API keys, emails, connection strings, internal IPs |
| Shared secret | `X-SYNQ-Secret` header | Optional. When `SYNQ_SECRET` is set, all non-health requests are authenticated. |

---

## Data Flow

### Save Chat (full pipeline)

```
Extension DOM scrape (user + AI turns)
  → FNV-1a fingerprint deduplication (prevents re-saving unchanged chats)
  → Privacy scrub — PII redacted client-side before leaving the browser
  → POST /api/chat/save (rate limited: 10/min)
        │
        ├── Vector Track (RAG)
        │     Sliding window chunker: 300-word windows, 80-word overlap
        │     Pure function — zero API calls, zero data loss
        │     → generateEmbeddings() via Ollama nomic-embed-text (parallel, Promise.all)
        │     → ChromaDB: deleteChunksBySession() then add() — clean re-save
        │
        └── Graph Track (Knowledge Graph)
              Groq LLaMA 3.1: summarizeChunk() → extractTriplesFromSummary()
              → Neo4j: MERGE (s:Entity) ... MERGE (s)-[r:RELATION]->(o) — idempotent
              → MongoDB: Session.findByIdAndUpdate() — tripleCount, hasFullChat
```

### Auto-Connect (per prompt, automatic)

```
Session loaded → content.ts init() → interceptor auto-attaches
User types prompt → keydown (Enter) / send button click intercepted (debounced 300ms)
  → POST /api/rag/retrieve  { prompt, sessionId, topN: 3 }
  → Ollama: generateEmbedding(prompt) → 768-dim vector
  → ChromaDB: cosine query, over-fetch (topN × 4), filter by sessionId
  → Threshold filter: score = 1 − cosine_distance ≥ 0.30
  → Deduplicate by chunkIndex (keep highest score per chunk)
  → Top-3 chunks → contextBlock string
  → Extension prepends to prompt → Selection API InputEvent injection → sent
```

> Full scoring logic, threshold tuning, and parameter reference: [RAG_PIPELINE.md](RAG_PIPELINE.md)

### Classic Inject (one-time, on demand)

```
Dashboard: "Load into Extension" → POST /api/context/active (sets active session in MongoDB)
User: popup "Inject Context (one-time)" → GET /api/context/retrieve/:sessionId
  → getTriplesBySession() from Neo4j
  → generateProjectSummary() via Groq (cached in Session.summary — not called if tripleCount unchanged)
  → Structured markdown summary → Selection API paste → user sends manually
```

---

## Services

| Service | Port | Technology | Purpose |
|---|---|---|---|
| Backend | 3001 | Node.js + Express 5 | Main application server |
| Neo4j | 7474 / 7687 | Neo4j 5.18 | Semantic knowledge graph |
| MongoDB | 27017 | MongoDB 7.0 (via Mongoose) | Sessions, FullChat, active session singleton |
| ChromaDB | 8000 | ChromaDB 0.6.3 | Vector store (cosine similarity) |
| Ollama | 11434 | Ollama | Local embedding generation |
| Dashboard | 5173 | React 19 + Vite 7 | Frontend UI |

---

## Data Models

### MongoDB

**Session** — project metadata and cached summary
```
{
  projectName: String (required),
  platform: "claude" | "chatgpt" | "gemini",
  tripleCount: Number,
  topicCount: Number,
  hasFullChat: Boolean,
  summary: String,           // cached Groq summary — regenerated only when tripleCount changes
  createdAt: Date,
  updatedAt: Date
}
```

**FullChat** — complete conversation storage
```
{
  sessionId: String (indexed),
  rawText: String,           // PII-scrubbed full conversation
  topics: [{ name, content, keywords }],  // lightweight chunk previews for the Chat tab
  platform: String,
  messageCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

**ActiveSession** (singleton document) — which session the extension is currently using
```
{ _id: "singleton", sessionId: String | null }
```

### Neo4j

All knowledge stored as typed triples:

```cypher
(Entity {name, type}) -[RELATION {type, sessionId, timestamp}]-> (Entity)
```

**Entity types (22):**
`Project · Technology · Feature · Bug · Decision · Concept · Library · API · Database · Framework · Auth · Architecture · Person · Pet · Goal · Problem · Preference · Habit · Tool · Pattern · Location · Organization`

**Relation types (20+):**
`USES · HAS_FEATURE · DEPENDS_ON · IS_A · STORES_IN · AUTHENTICATES_WITH · OWNS · NAMED · PREFERS · WANTS · KNOWS · HAS · LIVES_WITH · IS_BUILDING · SOLVED_WITH · STRUGGLING_WITH · DECIDED_TO · INTERESTED_IN · WORKS_AT · CREATED_BY · RUNS_ON`

### ChromaDB

**Collection:** `synq_chunks_v2`

Each document is a raw sliding window chunk (verbatim text from the conversation).

**Metadata per chunk:**
```json
{ "sessionId": "...", "chunkIndex": 2, "wordStart": 440, "wordEnd": 739 }
```

**Embedding model:** `nomic-embed-text` via Ollama (768 dimensions, cosine similarity space)

---

## Extension Architecture

### Message Types (content.ts ↔ background.ts ↔ popup.ts)

| Message | Direction | Purpose |
|---|---|---|
| `INGEST_TEXT` | content → background | Send scraped text for graph extraction |
| `SAVE_CHAT` | content → background | Send full chat for dual-track storage |
| `SAVE_CHAT_FROM_POPUP` | popup → content | Trigger scrape + save from popup button |
| `RAG_RETRIEVE` | content → background | Retrieve context chunks for a prompt |
| `GET_CONTEXT` | content → background | Get structured context summary |
| `CREATE_SESSION` | popup → background | Create a new session on the backend |
| `GET_ACTIVE_SESSION` | popup → background | Fetch active session from backend + sync local storage |
| `SET_ACTIVE_SESSION` | popup → background | Set a session as active on the backend |
| `SESSION_CHANGED` | background → content (broadcast) | Notify all open AI tabs of new active session |
| `GET_PAUSE_STATE` | popup → background | Read current pause state from chrome.storage |
| `SET_PAUSE_STATE` | popup → background | Write pause state to chrome.storage |
| `PAUSE_SYNQ` | popup → content | Suspend prompt interception |
| `RESUME_SYNQ` | popup → content | Resume prompt interception |
| `INJECT_NOW` | popup → content | Trigger one-time context injection |
| `PING` | popup → content | Check if content script is alive |

### Platform Selector Strategy

`queryAll()` in `src/platforms/index.ts` tries all selectors and merges results, deduplicating by DOM ancestry (keeping the deepest/most-specific element when a parent and child both match). This means adding more fallback selectors is always safe — it won't break existing ones.

See [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md) for per-platform selector reference and staleness tracking.

---

## Environment Variables

All configured in `backend/.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ Yes | — | Groq API key for LLaMA 3.1 |
| `NEO4J_URI` | ✅ Yes | `bolt://localhost:7687` | Neo4j Bolt connection string |
| `NEO4J_USER` | ✅ Yes | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | ✅ Yes | — | Neo4j password |
| `MONGO_URI` | ✅ Yes | `mongodb://localhost:27017/synqdb` | MongoDB connection string |
| `CHROMA_URL` | No | `http://localhost:8000` | ChromaDB base URL |
| `OLLAMA_URL` | No | `http://localhost:11434` | Ollama base URL |
| `SYNQ_SECRET` | No | — | Shared secret for request auth (optional) |
| `PORT` | No | `3001` | Backend server port |
| `DEBUG` | No | `false` | Enable debug log output |