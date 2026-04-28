# SYNQ Architecture

## Overview

SYNQ has three layers:

1. **Chrome Extension** — scrapes AI chats, intercepts prompts, injects context
2. **Node.js Backend** — processes text, stores data, handles RAG retrieval
3. **React Dashboard** — visualizes knowledge graphs, manages sessions

## Security Model

- **CORS** is restricted to `localhost:5173`, `localhost:4173`, and `chrome-extension://` origins only. No wildcard.
- **Rate limiting** — global 200 req/min across all routes; strict 10 req/min on `/api/chat/save` (the expensive LLM path).
- **Input validation** — all routes validate `sessionId` as a valid MongoDB ObjectId, `platform` as an enum, and text length before processing.
- **Body limit** — capped at 10MB (not 50MB) to prevent trivial DoS.
- **PII scrubbing** — API keys, JWTs, emails, connection strings are redacted before any text reaches Groq.

## Data Flow

### Save Chat

```
Extension DOM scrape (both user + AI turns)
  → FNV-1a fingerprint deduplication
  → Privacy scrub (PII redaction)
  → POST /api/chat/save (rate limited: 10/min)
  → Sliding window chunker: 300-word windows, 80-word overlap (pure function, no AI)
  → Vector embeddings: Ollama nomic-embed-text (parallel, not sequential)
  → ChromaDB storage (old vectors deleted first → no duplicates)
  → Triple extraction: Groq summarize → extract (technical + personal facts)
  → Neo4j MERGE (idempotent) + MongoDB upsert
```

### Auto-Connect (RAG)

```
Session loaded → Extension auto-attaches interceptor on init()
User types prompt → Extension intercepts (keydown + click, debounced 300ms)
  → POST /api/rag/retrieve (topN=3, clamped 1–6)
  → ChromaDB semantic search (cosine similarity, score = 1 - distance)
  → Threshold filter: score ≥ 0.30, deduplicated by chunkIndex
  → Top-3 chunks prepended to prompt → InputEvent injection → auto-sent
User can pause/resume via popup toggle (PAUSE_SYNQ / RESUME_SYNQ messages)
```

> Full pipeline details, similarity scoring, and tuning parameters: [RAG_PIPELINE.md](RAG_PIPELINE.md)

### Classic Inject

```
Dashboard selects session → "Load into Extension"
  → POST /api/context/active (sets active session in MongoDB singleton)
  → GET /api/context/retrieve/:sessionId
  → Summary served from cache (Session.summary) — Groq only called when tripleCount changes
  → Pasted into chat input via Selection API → user sends manually
```

## Services

| Service   | Port       | Purpose                              |
|-----------|------------|--------------------------------------|
| Backend   | 3001       | Main application server              |
| Neo4j     | 7474/7687  | Semantic knowledge graph             |
| MongoDB   | 27017      | Sessions, FullChat, active singleton |
| ChromaDB  | 8000       | Vector embeddings for RAG retrieval  |
| Ollama    | 11434      | Local embedding generation           |
| Dashboard | 5173       | React Vite dev server                |

## Data Models

### MongoDB

**Session** — project metadata
```
{ projectName, platform, tripleCount, topicCount, hasFullChat, summary, createdAt, updatedAt }
```

**FullChat** — full captured chat text + topic breakdown
```
{ sessionId, rawText, topics[{name, content, keywords}], platform, messageCount, createdAt, updatedAt }
```

**ActiveSession** (singleton) — the session currently loaded in the extension
```
{ _id: "singleton", sessionId }
```

### Neo4j

All knowledge stored as typed triples:
```
(Entity {name, type}) -[RELATION {type, sessionId, timestamp}]-> (Entity)
```

Entity types: `Project | Technology | Feature | Bug | Decision | Concept | Library | API | Database | Framework | Auth | Architecture | Person | Pet | Goal | Problem | Preference | Habit | Tool | Pattern | Location | Organization`

### ChromaDB

One collection: `synq_chunks_v2`

Each document: raw sliding window chunk text (verbatim)
Metadata: `{ sessionId, chunkIndex, wordStart, wordEnd }`
Embedding model: `nomic-embed-text` via Ollama (768 dimensions)