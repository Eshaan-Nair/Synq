# GLIA — Architecture

## Overview

GLIA has three layers:

1. **Chrome Extension** — scrapes AI conversations, intercepts prompts, injects context
2. **Node.js Backend** — processes text, orchestrates services, handles RAG retrieval, serves the dashboard, runs the MCP server
3. **React Dashboard** — visualizes the knowledge graph, manages sessions

---

## Data Flow

### Save Chat

```
Extension DOM scrape (user + AI turns)
  → FNV-1a fingerprint deduplication
  → Privacy scrub — PII redacted in browser before transmission
  → POST /api/chat/save (rate limited: 10/min)
        │
        ├── Vector Track (RAG)
        │     slidingWindowChunks() — 300-word windows, 80-word overlap
        │     Pure function — zero API calls, zero data loss
        │     → generateEmbeddings() via Ollama nomic-embed-text (parallel)
        │     → ChromaDB: deleteChunksBySession() then add() — clean re-save
        │
        └── Graph Track (Knowledge Graph)
              Auto-detect: Ollama llama3.1:8b (primary) or Groq (fallback)
              summarizeChunk() → extractTriplesFromSummary()
              → Graph Store: MERGE (s:Entity) ...
              → Session Store: Update tripleCount, hasFullChat
```

### Auto-Connect (every prompt)

```
Session loaded → content.ts init() → interceptor auto-attaches
User types → keydown/send button intercepted (debounced 300ms)
  → POST /api/rag/retrieve { prompt, sessionId, topN: 3 }
  → generateEmbedding(prompt) via Ollama → 768-dim vector
  → ChromaDB cosine query, filtered by sessionId
  → threshold: score = 1 − cosine_distance >= 0.30
  → sanitizeChunks() — injection patterns redacted
  → wrapInContextBlock() — XML context delimiters
  → Top-3 chunks prepended to prompt → sent
```

### Classic Inject (on demand)

```
Dashboard: "Load into Extension" → POST /api/context/active
User: popup "Inject Context" → GET /api/context/retrieve/:sessionId
  → getTriplesBySession() from Neo4j
  → generateProjectSummary() via Ollama/Groq (cached in Session.summary)
  → Structured markdown → Selection API paste → user sends manually
```

### MCP Tools (external AI tools)

```
AI tool (Cursor/Claude Code/etc.) → MCP stdio call
  → recall_context:      Hybrid search (Vector + Graph) → sanitize → XML wrap
  → store_memory:        Full chat save + Graph extraction + Vector storage
  → search_memory:       Global Hybrid Search across all projects
  → list_projects:       Session listing with metadata
  → get_project_summary: Knowledge graph browsable as a Resource
  → identify_project:    CWD-to-ID auto-matching
```

---

## Security Model

| Control | Implementation |
|---|---|
| CORS | `localhost:3001`, `localhost:5173`, `chrome-extension://` only |
| Rate limiting | 200 req/min global; 10 req/min on `/api/chat/save` |
| Input validation | sessionId as valid MongoDB ObjectId; platform as enum; text length minimum |
| Body limit | 5 MB cap on express.json |
| Security headers | helmet on every response |
| PII scrubbing | `src/utils/privacy.ts` — runs before any transmission |
| Prompt injection | `src/middleware/sanitize.ts` — 10 pattern scan + XML context delimiters |
| Shared secret | Optional `X-GLIA-Secret` header — when `GLIA_SECRET` is set, all non-health requests authenticated |

---

## Services

| Service | Port | Technology | Notes |
|---|---|---|---|
| Backend + Dashboard | 3001 | Node.js, Express 5, sirv | API + static dashboard serving |
| **SQLite (Default)** | — | better-sqlite3 | Sessions, Graph, Metadata (Zero-Docker) |
| **SQLite-vec** | — | sqlite-vec | Vector storage (Zero-Docker) |
| Neo4j | 7474 / 7687 | Neo4j 5.18 | Docker Mode Only |
| MongoDB | 27017 | MongoDB 7.0 | Docker Mode Only |
| ChromaDB | 8000 | ChromaDB 0.6.3 | Docker Mode Only |
| Ollama | 11434 | Ollama | Local embeddings + extraction |
| MCP Server | stdio | @modelcontextprotocol/sdk | External AI tool integration |

---

## Data Models (Unified)

These schemas apply to both **SQLite tables** and **MongoDB collections**.

```
{
  projectName: String (required),
  platform:    "claude" | "chatgpt" | "gemini" | "deepseek" | "mcp",
  tripleCount: Number,
  topicCount:  Number,
  hasFullChat: Boolean,
  summary:     String,   // cached — regenerated only when tripleCount changes
  createdAt:   Date,
  updatedAt:   Date
}
```

### MongoDB — FullChat

```
{
  sessionId:    String (indexed),
  rawText:      String,           // PII-scrubbed full conversation
  topics:       [{ name, content, keywords }],  // chunk previews for Chat tab
  platform:     String,
  messageCount: Number,
  createdAt:    Date,
  updatedAt:    Date
}
```

### MongoDB — ActiveSession (singleton)

```
{ _id: "singleton", sessionId: String | null }
```

### Neo4j

```cypher
(Entity {name, type}) -[RELATION {type, sessionId, timestamp}]-> (Entity)
```

**Entity types (22):**
`Project · Technology · Feature · Bug · Decision · Concept · Library · API · Database · Framework · Auth · Architecture · Person · Pet · Goal · Problem · Preference · Habit · Tool · Pattern · Location · Organization`

**Relation types (20+):**
`USES · HAS_FEATURE · DEPENDS_ON · IS_A · STORES_IN · AUTHENTICATES_WITH · OWNS · NAMED · PREFERS · WANTS · KNOWS · HAS · LIVES_WITH · IS_BUILDING · SOLVED_WITH · STRUGGLING_WITH · DECIDED_TO · INTERESTED_IN · WORKS_AT · CREATED_BY · RUNS_ON`

### ChromaDB

**Collection:** `glia_chunks_v2`

```json
{
  "id": "sessionId-chunkIndex",
  "document": "raw chunk text (verbatim)",
  "metadata": { "sessionId": "...", "chunkIndex": 2, "wordStart": 440, "wordEnd": 739 },
  "embedding": [768-dim float array]
}
```

**Model:** `nomic-embed-text` via Ollama — 768 dimensions, cosine similarity, CPU-only.

---

## Extension Architecture

### Message Types

| Message | Direction | Purpose |
|---|---|---|
| `SAVE_CHAT_FROM_POPUP` | popup → content | Trigger scrape + save |
| `RAG_RETRIEVE` | content → background | Retrieve context for a prompt |
| `GET_CONTEXT` | content → background | Get structured knowledge summary |
| `CREATE_SESSION` | popup → background | Create new session |
| `GET_ACTIVE_SESSION` | popup → background | Fetch active session |
| `SET_ACTIVE_SESSION` | popup → background | Set active session |
| `SESSION_CHANGED` | background → content (broadcast) | Notify all tabs of session change |
| `GET_PAUSE_STATE` | popup → background | Read pause state |
| `SET_PAUSE_STATE` | popup → background | Write pause state |
| `PAUSE_GLIA` | popup → content | Suspend interception |
| `RESUME_GLIA` | popup → content | Resume interception |
| `INJECT_NOW` | popup → content | One-time injection |
| `PING` | popup → content | Check if content script is alive |

### Selector Strategy

`resolver.ts` in `extension/src/platform/` defines ordered fallback arrays for each platform's input box. Each platform tries up to 7 strategies in sequence (testid → aria-label → role → placeholder → generic contenteditable). A MutationObserver auto-retries if the input is not yet in the DOM (e.g. SPA navigation still loading).

`queryAll()` in `src/platforms/index.ts` tries all response/user selectors and deduplicates by DOM ancestry — keeping the most specific (deepest) element when parent and child both match.

---

## Environment Variables

All configured in `backend/.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEO4J_URI` | Yes | `bolt://localhost:7687` | Neo4j Bolt connection |
| `NEO4J_USER` | Yes | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | Yes | — | Neo4j password |
| `MONGO_URI` | Yes | `mongodb://localhost:27017/gliadb` | MongoDB connection |
| `GROQ_API_KEY` | No | — | Groq fallback key (only needed if Ollama unavailable) |
| `GRAPH_BACKEND` | No | auto-detect | `ollama` or `groq` — overrides auto-detection |
| `OLLAMA_URL` | No | `http://localhost:11434` | Ollama base URL |
| `OLLAMA_MODEL` | No | `llama3.1:8b` | Model for graph extraction |
| `CHROMA_URL` | No | `http://localhost:8000` | ChromaDB base URL |
| `GLIA_SECRET` | No | — | Shared secret for request auth |
| `GLIA_PROFILE` | No | auto-detect | `full` or `lite` — overrides RAM detection |
| `PORT` | No | `3001` | Backend server port |
