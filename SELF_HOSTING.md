# Self-Hosting Guide

SYNQ is designed to run entirely on your own machine. No data leaves your network except text sent to Groq for AI processing.

## What runs locally

| Component   | Technology  | Data stored |
|-------------|-------------|-------------|
| Knowledge graph | Neo4j 5.18 (Docker) | Semantic triples |
| Session store   | MongoDB 7.0 (Docker) | Session metadata + full chats |
| Vector store    | ChromaDB 0.6.3 (Docker) | Topic embeddings |
| Embeddings      | Ollama (local binary) | `nomic-embed-text` model |
| Backend         | Node.js / Express | No persistent state |
| Dashboard       | React / Vite | No persistent state |

## What goes to Groq

Only the text you explicitly **Save Chat** is sent to Groq — and only for **graph extraction**, not for RAG. The pipeline:
- **RAG chunking** — handled locally by the sliding window chunker (pure function, no API call)
- **Graph extraction** — Groq compresses the text into fact bullets, then extracts semantic triples (technical + personal facts)
- **Summary generation** — Groq generates a structured project summary (cached — not called on every read)

Groq's privacy policy: https://groq.com/privacy-policy/

> **Note:** If Groq is unavailable or rate-limited, chat data and RAG vectors are still saved successfully — only knowledge graph extraction is skipped. SYNQ degrades gracefully.

PII (API keys, JWTs, emails, connection strings) is redacted **before** the text is sent to Groq.

---

## System requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| RAM | 8 GB | 16 GB |
| Disk | 5 GB free | 10 GB free |
| OS | Windows 10 / macOS 12 / Ubuntu 22 | Any |
| Docker | 24.x+ | Latest |
| Node.js | 18.x | 20.x LTS |

**Note:** Ollama runs the embedding model on CPU — no GPU required. On a modern laptop CPU, embedding 10 topics takes ~2–3 seconds total (parallel requests).

---

## Ports used

| Port  | Service   | Can be changed? |
|-------|-----------|-----------------|
| 3001  | Backend   | Yes — set `PORT` in `backend/.env` |
| 5173  | Dashboard | Yes — Vite port, see `dashboard/vite.config.ts` |
| 7474  | Neo4j HTTP | Yes — update `docker-compose.yml` |
| 7687  | Neo4j Bolt | Yes — update `NEO4J_URI` in `.env` |
| 27017 | MongoDB   | Yes — update `MONGO_URI` in `.env` |
| 8000  | ChromaDB  | Yes — update `CHROMA_URL` in `.env` |
| 11434 | Ollama    | Yes — update `OLLAMA_URL` in `.env` |

---

## Customising passwords

The default passwords in `docker-compose.yml` are environment variable references with fallbacks. To use custom passwords:

1. Add to `backend/.env`:
```env
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_secure_password
MONGO_USER=synq
MONGO_PASSWORD=your_secure_password
```

2. The `docker-compose.yml` reads these via `${NEO4J_PASSWORD:-synqpassword123}` — the value after `:-` is only used if the variable is unset.

3. Update `MONGO_URI` in `.env` with the new password:
```env
MONGO_URI=mongodb://synq:your_secure_password@localhost:27017/synqdb?authSource=admin
```

---

## Backing up your data

All data is in named Docker volumes:

```bash
# List volumes
docker volume ls | grep synq

# Backup Neo4j (macOS / Linux)
docker run --rm -v synq_neo4j_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/neo4j-backup.tar.gz /data

# Backup Neo4j (Windows PowerShell)
docker run --rm -v synq_neo4j_data:/data -v "${PWD}:/backup" alpine `
  tar czf /backup/neo4j-backup.tar.gz /data

# Backup MongoDB
docker exec synq_mongo mongodump --out /dump
docker cp synq_mongo:/dump ./mongo-backup

# Backup ChromaDB (macOS / Linux)
docker run --rm -v synq_chroma_data:/chroma/chroma -v $(pwd):/backup alpine \
  tar czf /backup/chroma-backup.tar.gz /chroma/chroma

# Backup ChromaDB (Windows PowerShell)
docker run --rm -v synq_chroma_data:/chroma/chroma -v "${PWD}:/backup" alpine `
  tar czf /backup/chroma-backup.tar.gz /chroma/chroma
```

> **Note:** `$(pwd)` is bash syntax. On Windows PowerShell use `"${PWD}"` instead.

---

## Resetting everything

```bash
# Stop all containers
docker-compose down

# Delete all data volumes (DESTRUCTIVE — all sessions/graphs/vectors lost)
docker volume rm synq_neo4j_data synq_mongo_data synq_chroma_data

# Restart fresh
docker-compose up -d
```

---

## Running behind a reverse proxy

If you want to expose the dashboard externally (e.g. on a home server):

1. Update CORS allowed origins in `backend/src/index.ts`:
```ts
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://your-domain.com",  // add your domain
];
```

2. Configure Nginx/Caddy to proxy:
   - `your-domain.com` → `localhost:5173` (dashboard)
   - `your-domain.com/api` → `localhost:3001` (backend)

3. Update `dashboard/src/api/synq.ts` and `dashboard/src/api/rag.ts` to use the full backend URL instead of `http://localhost:3001`.

> ⚠️ Do not expose Neo4j, MongoDB, or ChromaDB ports externally. They have no authentication beyond the basic passwords.
