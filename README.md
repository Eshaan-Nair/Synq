<div align="center">

# GLIA — Persistent Memory for AI Coding Tools

### Your AI forgets everything between sessions. GLIA fixes that.
### Memory saved in a browser chat is instantly available in your coding tool, and vice versa.

**A local-first memory layer that captures your conversations, builds a searchable knowledge graph, and automatically injects the right context into every new prompt — no cloud, no subscriptions, no re-explaining yourself.**

<br/>

[![Stars](https://img.shields.io/github/stars/Eshaan-Nair/Glia-AI?style=for-the-badge&logo=github&labelColor=0B0E14&color=6366F1)](https://github.com/Eshaan-Nair/Glia-AI/stargazers)
[![Forks](https://img.shields.io/github/forks/Eshaan-Nair/Glia-AI?style=for-the-badge&logo=github&labelColor=0B0E14&color=06B6D4)](https://github.com/Eshaan-Nair/Glia-AI/forks)
[![Issues](https://img.shields.io/github/issues/Eshaan-Nair/Glia-AI?style=for-the-badge&logo=github&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Glia-AI/issues)
[![Downloads](https://img.shields.io/npm/dt/glia-ai-setup?style=for-the-badge&logo=npm&labelColor=0B0E14&color=CB3837)](https://www.npmjs.com/package/glia-ai-setup)
[![Version](https://img.shields.io/badge/version-1.5.1-6366F1?style=for-the-badge&labelColor=0B0E14)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-F8FAFC?style=for-the-badge&labelColor=0B0E14)](LICENSE)

<br/>

**Browser Extension:** Claude · ChatGPT · Gemini · DeepSeek · Grok · Copilot · Mistral

**MCP (AI Coding Tools):** Claude Code · Cursor · Windsurf · Claude Desktop

https://github.com/user-attachments/assets/49d8eb52-c266-449a-ae45-147ec755ec09

<br/>

</div>

## One Command Setup

```bash
npx glia-ai-setup
```


---

## The Problem

You are deep in a complex project. You have had 30 conversations with Claude about your auth flow, database schema, and deployment strategy. You open a new chat — and it is all gone. You spend 10 minutes re-explaining context you have already covered, and the AI gives you advice that contradicts decisions you made two weeks ago.

GLIA stops the cycle. It captures your AI conversations, extracts structured facts into a knowledge graph, embeds them as searchable vectors, and automatically prepends the most relevant context to every new prompt — before you even finish typing.

---

## Table of Contents

- [How the Two Modes Work](#how-the-two-modes-work)
- [Key Features](#key-features)
- [Performance Benchmarks](#performance-benchmarks)
- [System Requirements](#system-requirements)
- [Installation](#installation)
  - [Web Extension Setup](#web-extension-setup)
  - [MCP Server Setup](#mcp-server-setup)
  - [Running Both Together](#running-both-together)
- [Usage Guide](#usage-guide)
  - [Using the Browser Extension](#using-the-browser-extension)
  - [Using the MCP Tools](#using-the-mcp-tools)
  - [Dashboard](#dashboard)
- [How It Works](#how-it-works)
- [Quality-of-Life Details](#quality-of-life-details)
- [Architecture](#architecture)
- [Privacy and Security](#privacy-and-security)
- [What's New in v1.5.1](#whats-new-in-v151)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## How the Two Modes Work

GLIA has two complementary modes that share the same memory store. You can use one, the other, or both at the same time.

### Mode 1 — Browser Extension (Web)

The extension lives inside Chrome and works on any AI chat website. When you save a conversation, it scrapes the page, scrubs PII, chunks and embeds the text locally, and sends it to the GLIA backend. On every subsequent prompt you type, the extension intercepts the input, queries the backend for relevant context, and prepends it to your message automatically — before the request hits the AI.

Best for: Claude, ChatGPT, Gemini, DeepSeek, Grok, Microsoft Copilot, and Mistral web interfaces.

### Mode 2 — MCP Server (Coding Tools)

The MCP server exposes GLIA as a set of tools that coding agents can call directly. Instead of intercepting DOM events, the AI tool calls `recall_context` at the start of a session to pull in relevant memory, and `store_memory` after completing work to save decisions and context for future sessions.

Best for: Claude Code, Cursor, Windsurf — anywhere you write code with an AI coding agent.

### Shared Memory

Both modes write to and read from the same backend database. A conversation you save via the browser extension is immediately available to `recall_context` in your coding tool, and vice versa. They are two interfaces into one unified knowledge base.

---

## Key Features

### Core Retrieval Engine

| Feature | Detail |
|:---|:---|
| **Three-Layer Hybrid Search** | Sentence vectors, chunk vectors, and FTS5 keyword search run in parallel. Results are fused and ranked by a combined score. |
| **Surgical Sentence Trimming** | Chunks are split into individual sentences at index time. On retrieval, only the sentences that directly match the query are returned — not the entire surrounding paragraph. Reduces prompt noise by up to 95%. |
| **HyDE (Hypothetical Document Embedding)** | Before querying the vector store, GLIA generates a hypothetical answer to your query and uses that embedding alongside the raw query. This dramatically improves recall for rephrased or indirect questions. |
| **Small-to-Big Retrieval** | High-precision sentence match triggers fetching the parent chunk for broader context. Precision of a sentence search, context of a full paragraph. |
| **Knowledge Graph Layer** | Every saved conversation is processed to extract subject-relation-object triples (22 entity types, 20+ relation types). Graph facts are fused with vector results on every recall. |
| **Background Indexing** | Sentence-level embedding is offloaded to a background job queue so Save is instant. The deep index is built asynchronously without blocking the UI. |

### Extension Quality-of-Life

| Feature | Detail |
|:---|:---|
| **Auto-Connect** | Once a session is active, GLIA re-attaches automatically on every page load. No clicking required — just type. |
| **SPA Navigation Awareness** | Detects "New Chat" clicks in single-page apps (ChatGPT, Claude, Gemini) without a full page reload. Automatically resets the active session so context does not bleed between conversations. |
| **Pause / Resume** | One click in the popup pauses auto-injection. Click again to resume. State persists across tabs. |
| **Classic Inject** | One-time manual inject button for priming a cold start without enabling auto-connect. |
| **FNV-1a Deduplication** | Identical conversation segments are fingerprinted and skipped — re-saving a chat never creates duplicate embeddings. |
| **Multi-Strategy DOM Resolver** | Each platform has five ordered selector strategies. If one breaks after a UI update, the next activates automatically. |
| **Restricted URL Guard** | Injection is blocked on `chrome://`, `about:`, and extension pages. Prevents crashes on non-chat pages. |

### MCP Tool Quality-of-Life

| Tool | What it does |
|:---|:---|
| `recall_context` | Retrieves the top-N most relevant memory chunks for a prompt, scoped to a project. Includes knowledge graph facts. |
| `store_memory` | Saves text or a transcript to GLIA memory. Auto-creates the project if it does not exist. Triggers full background indexing. |
| `search_memory` | Cross-project global search. Useful for finding decisions made in a different project that apply to the current one. |
| `list_projects` | Lists all saved projects with metadata — chunk count, triple count, last updated. |
| `get_project_summary` | Returns a structured knowledge graph summary for a project as readable markdown. |
| `identify_active_project` | Matches a folder path against saved project names. Lets the AI agent auto-detect which project it is working on from the CWD. |
| `prune_memory` | Surgically removes facts or chunks matching a description. Corrects outdated information without wiping an entire project. |

### Infrastructure

| Feature | Detail |
|:---|:---|
| **Zero-Docker Mode** | `GLIA_STORAGE_MODE=sqlite` replaces all Docker services with a single `glia.db` file. Full feature parity — vector search, knowledge graph, job queue, everything. |
| **WAL Concurrency** | SQLite runs in Write-Ahead Logging mode, allowing simultaneous reads from the dashboard, extension, and MCP server without lock contention. |
| **Dead Letter Queue** | Background jobs that fail are retried up to 5 times with exponential backoff. Failed jobs move to a dead letter queue visible in the dashboard — nothing is silently lost. |
| **Ghost Job Cleanup** | On startup, any jobs stuck in PROCESSING state from a previous crashed run are automatically reset to PENDING. |
| **Rate Limiting** | Save endpoint is rate-limited independently from read endpoints. Prevents accidental flooding from rapid saves. |
| **Helmet Security Headers** | All responses include `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and related headers. |

---

## Performance Benchmarks

Every release is stress-tested across four independent audits. All results are reproducible using the scripts in `backend/scripts/`.

### Web Context Engine (Browser Extension)

**Scale:** 1,000 chunks (~300,000 words) | **Needles:** 20 facts | **Queries:** 60 phrasings

| Metric | Result | What it means |
|:---|:---|:---|
| **Recall @ 1** | **90.0%** | Correct fact was the top result in 54 of 60 searches |
| **Mean Reciprocal Rank** | **0.806** | Correct answer appears at position 1.24 on average (1.0 is perfect) |
| **Context Compression** | **95.0%** | Payload reduced from 55,350 chars to 2,784 chars before injection |
| **Mean Relevance Score** | **0.464** | Average semantic similarity of retrieved results (0–1 scale) |

Engine contribution across 54 successful recalls:

| Engine | Hits | Role |
|:---|:---|:---|
| Sentence Vector | 50 | High-precision match against individual sentences |
| Chunk Vector | 47 | Thematic match against full 150-word context windows |
| FTS5 Keyword | 43 | Exact literal matching, boosts low-similarity vector results |

The 6 misses were all on degenerate "Context on X?" queries with no semantic content. All natural-language and rephrased queries passed.

Full report: [reports/benchmark_web.md](reports/benchmark_web.md)

---

### MCP Context Engine (Coding Tools)

**Scale:** 10 facts across real project memory | **Queries:** 30 (3 phrasings each) | **TopN:** 6

| Metric | Result | Target | |
|:---|:---|:---|:---|
| **Total Recall** | **90%** | >90% | PASS |
| **Context Compression** | **81.3%** | >75% | PASS |
| **Noise Redacted** | **131,700 chars** | — | vs. returning 6 full chunks raw |

Engine contribution across 27 successful recalls:

| Engine | Hits | Contribution |
|:---|:---|:---|
| Sentence Vector | 26 | 100% of recalls |
| FTS Keyword | 24 | 92.3% of recalls |
| Chunk Vector | 9 | 34.6% of recalls |

The 3 misses were all on highly rephrased semantic queries with no shared keywords. Standard and lowercase phrasings passed in every case.

Full report: [reports/benchmark_mcp.md](reports/benchmark_mcp.md)

---

### MCP Project Isolation Audit

**Scale:** 10 simultaneous projects | **Checks:** Store + own-recall + cross-leak per project

| Metric | Result | Status |
|:---|:---|:---|
| **Isolation Integrity** | **100%** | ELITE — zero cross-project leakage |
| **Concurrent Access** | **Pass** | All projects readable under simultaneous load |
| **Leak Detection** | **Negative** | No data from any project visible in another |

Each project's vector space and knowledge graph is strictly siloed via `sessionId` constraints. Aggressive cleanup logic purges both IDs and Names between runs to prevent identity drift.

Full report: [reports/mcp_stress_test.md](reports/mcp_stress_test.md)

---

### Knowledge Graph Stress Audit

**Scale:** 1,200+ nodes, 1,087 triples in a single session

| Metric | Result | Status |
|:---|:---|:---|
| **Total Triples Stored** | **1,087** | PASS |
| **Ingestion Throughput** | **4,056 triples/sec** | OPTIMIZED |
| **Generation Time** | **0.3 seconds** | ELITE |
| **Dashboard Load** | **< 1.5 seconds** | Physics-simulated D3.js render |
| **Storage Cost** | **~0.2 MB** | SQLite increase for entire stress session |

Graph structure: 5 major hubs (40+ edges each), 15 intermediate clusters, 400 mesh entities, 100 isolated standalone facts.

Full report: [reports/graph_stress_test.md](reports/graph_stress_test.md)

---

## System Requirements

| Mode | Min RAM | Disk | Docker | What runs |
|:---|:---|:---|:---|:---|
| **SQLite (Recommended)** | 2 GB | 3 GB | Not required | All features — single `.db` file + Ollama |
| **Full Docker** | 8 GB | 15 GB | Required | Neo4j + MongoDB + ChromaDB + Ollama |
| **Lite Docker** | 4 GB | 10 GB | Required | MongoDB + ChromaDB (no knowledge graph) |

SQLite mode is the recommended default. The installer detects Docker automatically and sets SQLite mode if Docker is not available.

### Prerequisites

| Requirement | Version | Notes |
|:---|:---|:---|
| Node.js | 20 LTS+ | [nodejs.org](https://nodejs.org) |
| Ollama | Latest | [ollama.com](https://ollama.com) — required for local embeddings and extraction |
| Docker Desktop | 24.0+ | [docker.com](https://docker.com) — only needed for Docker mode |
| Groq API Key | — | [console.groq.com](https://console.groq.com) — free, used as fallback if Ollama is slow |

---

## Installation

### One-Command Setup (All Platforms)

```bash
npx glia-ai-setup
```

This is the recommended starting point for all users. It clones the repo, checks dependencies, pulls Ollama models, installs packages, and builds everything. Run it once and then use `start.bat` or `start.sh` for daily use.

---

### Web Extension Setup

The extension requires the GLIA backend to be running. It does not work standalone.

**Step 1 — Install and start the backend**

```bash
# One-command (recommended)
npx glia-ai-setup

# Or manual
git clone https://github.com/Eshaan-Nair/Glia-AI.git
cd Glia-AI/backend
cp .env.example .env        # Edit .env — add GROQ_API_KEY if using Groq
npm install
```

Set storage mode in `backend/.env`:
```
GLIA_STORAGE_MODE=sqlite    # Recommended — no Docker needed
OLLAMA_URL=http://localhost:11434
GROQ_API_KEY=gsk_your_key_here
```

Start the backend:
```bash
# Windows
start.bat

# macOS / Linux
./start.sh
```

The backend starts on `http://localhost:3001`. The dashboard is served from the same port.

**Step 2 — Build the extension**

```bash
cd extension
npm install
npm run build
```

This produces the `extension/dist/` folder.

**Step 3 — Load into Chrome**

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `Glia-AI/extension/dist` folder
5. The GLIA icon appears in your toolbar

**Step 4 — Use it**

Navigate to Claude, ChatGPT, Gemini, DeepSeek, Grok, Copilot, or Mistral. Click the GLIA popup, enter a project name, and click **Save Chat**. Auto-connect activates immediately.

**Daily use:**
- Windows: double-click `start.bat`
- macOS/Linux: `./start.sh`

---

### MCP Server Setup

The MCP server runs as a separate process and communicates with AI coding tools over stdio. The backend does **not** need to be running as an HTTP server — the MCP server initializes its own storage connection.

**Step 1 — Build the backend**

```bash
cd backend
npm install
npm run build
```

This produces `backend/dist/mcp/server.js`.

**Step 2 — Generate your config (easiest)**

```bash
cd backend
npm run mcp:config
```

This prints a pre-formatted JSON block with absolute paths resolved for your machine. Copy it directly into your tool's config file.

**Step 3 — Add to your AI tool**

**Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/.claude/claude_desktop_config.json` (macOS):
```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["C:/path/to/Glia-AI/backend/dist/mcp/server.js"]
    }
  }
}
```

**Claude Code** — run in your project directory:
```bash
claude mcp add glia node /path/to/Glia-AI/backend/dist/mcp/server.js
```

**Cursor** — create `.cursor/mcp.json` in your project root:
```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["/path/to/Glia-AI/backend/dist/mcp/server.js"]
    }
  }
}
```

**Windsurf** — create `.windsurf/mcp.json` in your project root:
```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["/path/to/Glia-AI/backend/dist/mcp/server.js"]
    }
  }
}
```

> Use forward slashes in all paths, even on Windows. Restart your AI tool after editing the config.

**Step 4 — Set the storage mode**

The MCP server reads `backend/.env`. Make sure it contains:
```
GLIA_STORAGE_MODE=sqlite
OLLAMA_URL=http://localhost:11434
```

Ollama must be running for the MCP server to generate embeddings and extract knowledge graph triples.

---

### Running Both Together

When running the browser extension and MCP server together, they share the same `glia.db` database. No extra configuration is needed.

1. Start the HTTP backend: `start.bat` or `./start.sh`
2. Load the extension in Chrome (it talks to `http://localhost:3001`)
3. Your AI coding tool starts the MCP server automatically when you open a project

Memory saved via the extension is immediately available in `recall_context`, and memory stored via `store_memory` appears in the dashboard history. They are the same database.

The HTTP backend and MCP server both use WAL mode on SQLite, which allows them to read and write concurrently without locking each other out.

---

## Usage Guide

### Using the Browser Extension

**Saving a conversation:**
1. Have a conversation on any supported platform
2. Click the GLIA icon in the Chrome toolbar
3. Enter a project name (e.g. `AuthService`, `MyApp-Backend`)
4. Click **Save Chat**

GLIA scrubs PII, chunks the text, embeds it locally with Ollama, and sends it to the backend. The UI confirms success in under 5 seconds. Background indexing (sentence-level embeddings, knowledge graph extraction) continues asynchronously.

**Auto-connect:**

Once a session is saved and activated, GLIA intercepts every prompt you type on that platform. Before the request is sent, it queries the backend for relevant context and prepends the top results. You do not need to do anything — just type normally.

To pause: click the GLIA popup and hit **Pause**. The badge dims. Click again to resume.

**New chat detection:**

When you click "New Chat" on ChatGPT, Claude.ai, or Gemini, GLIA detects the URL or DOM change and resets the active session. The next Save will start a fresh project, and context from the previous session will not bleed in.

**Classic inject:**

For a one-time context push without enabling auto-connect, click **Inject Context** in the popup. GLIA pastes the knowledge graph summary directly into the chat input field. You review it and send manually.

---

### Using the MCP Tools

Once connected, your coding agent has access to seven GLIA tools. A typical session looks like this:

**At session start — recall project memory:**
```
Use recall_context with prompt: "implementing JWT refresh token rotation"
and project: "AuthService"
```

**After completing work — save decisions:**
```
Use store_memory with content: "We implemented refresh token rotation using
Redis for token invalidation. The key insight was using a sliding expiry window
of 15 minutes for access tokens and 7 days for refresh tokens." and project: "AuthService"
```

**Finding something from a different project:**
```
Use search_memory with query: "rate limiting strategy"
```

**Getting an overview before starting:**
```
Use get_project_summary for project: "AuthService"
```

**Auto-detecting the current project:**
```
Use identify_active_project with path: "/Users/me/code/auth-service"
```

**Correcting outdated information:**
```
Use prune_memory with prompt: "Redis rate limiting" and project: "AuthService"
```

---

### Dashboard

Open `http://localhost:3001` while the backend is running.

| Tab | What you see |
|:---|:---|
| **Graph** | D3.js force-directed knowledge graph. Nodes are entities, edges are relations. Degree-scaled sizing — high-connectivity nodes appear larger. Hover for details, scroll to zoom, drag to reposition. |
| **History** | All extracted triples (subject / relation / object) with timestamps. Filterable by project and relation type. |
| **Chat** | The full saved conversation rendered as color-coded chat bubbles, with platform attribution. |
| **Job Queue** | Live view of background indexing jobs — pending, processing, completed, dead-lettered. |

---

## How It Works

```
SAVE
  Browser scrapes conversation → FNV-1a dedup check
  → PII scrub (API keys, JWTs, emails, IPs → [REDACTED])
  → POST to backend

STORAGE (two parallel tracks)

  Vector Track                      Graph Track
  Sliding window chunker            Text sent to Ollama llama3.1:8b
  300 words, 80-word overlap        (Groq as fallback)
  Embeds with nomic-embed-text      Extracts subject-relation-object triples
  Stores in SQLite vec0             Stores in SQLite facts table
  Background: sentence-level        Background: stores after chunk embedding
  embedding job queued

RECALL (on every prompt or tool call)
  Query → HyDE (generate hypothetical answer → embed both)
  → Sentence vector search (top 100, filter by session)
  → Chunk vector search (top 20, filter by session)
  → FTS5 keyword search (prefix match, filter by session)
  → Fuse results, score, deduplicate
  → Surgical trim (keep only matching sentences from each chunk)
  → sanitizeChunks() (scan for injection patterns → redact)
  → wrapInContextBlock() (lean text header)
  → Prepend to prompt
```

---

## Quality-of-Life Details

These are the smaller decisions that make the system faster and more reliable in practice.

**Instant save, deep index later.** When you click Save, only the chunk-level embeddings are computed synchronously (1–2 embeddings). Sentence-level embeddings (20–40 embeddings per conversation) are offloaded to a background job. The UI confirms success immediately; the deep index catches up within seconds.

**Delete-then-insert for vector updates.** SQLite virtual tables do not support `UPDATE` on vector columns. GLIA uses a delete-then-insert pattern to avoid `UNIQUE constraint` errors when re-saving a conversation.

**Prefix keyword matching.** FTS5 queries use wildcard suffixes (`encrypt*` matches `encryption`, `encrypted`, `encryptor`). This significantly improves recall for technical terms where the exact suffix varies.

**Threshold set at 0.30, not 0.45.** Surgical trimming allows a lower similarity threshold. Even if a chunk is only loosely related, if the matching sentences are precise, the noise penalty is near zero.

**History-aware fallback.** If a query is detected as a history-seeking question ("what did we talk about", "what was decided"), the trimmer falls back to the first three sentences of the chunk rather than returning nothing.

**5-character minimum sentence filter.** The sentence splitter ignores fragments shorter than 5 characters. This prevents code snippets and punctuation artifacts from polluting the sentence index.

**WAL mode on all writes.** SQLite is opened in WAL mode on startup. The MCP server, HTTP backend, and dashboard can all read and write concurrently without database lock errors.

**Ghost job recovery.** On startup, any jobs stuck in `PROCESSING` from a previous crash are reset to `PENDING` automatically. No manual intervention needed after an unclean shutdown.

**CORS locked to localhost.** The backend only accepts requests from `localhost` origins. External requests are rejected before they reach any route handler.

---

## Architecture

```
Glia-AI/
├── backend/
│   ├── src/
│   │   ├── mcp/           MCP server and seven tool implementations
│   │   ├── routes/        REST API (chat, rag, session, jobs)
│   │   ├── services/      Storage bridge, SQLite engine, vector store,
│   │   │                  graph store, embeddings, job queue, extractor
│   │   ├── middleware/     Rate limiting, sanitization, CORS
│   │   └── utils/         Logger, privacy scrubber
│   └── scripts/           Benchmarking, stress testing, maintenance tools
├── dashboard/             React 19 + D3.js + Vite — built to dashboard/dist/
├── extension/
│   ├── src/
│   │   ├── platform/      Multi-strategy DOM resolver
│   │   ├── platforms/     claude, chatgpt, gemini, deepseek, grok, copilot, mistral
│   │   ├── content.ts     DOM scraping, prompt interception, auto-connect
│   │   └── background.ts  Service worker, backend proxy
│   └── popup/             Popup UI and controls
├── reports/               Benchmark and audit outputs
├── .env.example           Configuration template
├── docker-compose.yml     Full Docker profile
├── install.bat / .sh      First-time setup
└── start.bat / .sh        Daily launcher
```

### Ports

| Service | Port | Notes |
|:---|:---|:---|
| Backend API + Dashboard | 3001 | Single process — API and static files |
| MCP Server | stdio | Spawned by your AI tool on demand |
| Ollama | 11434 | Local LLM and embeddings |
| Neo4j | 7474 / 7687 | Docker full mode only |
| MongoDB | 27017 | Docker mode only |
| ChromaDB | 8000 | Docker mode only |

### Tech Stack

| Layer | Technology |
|:---|:---|
| Extension | TypeScript, Chrome MV3, esbuild |
| Backend | Node.js, Express 5, TypeScript, Pino |
| Vector Store | SQLite-vec (vec0 virtual tables, 768-dim float32) |
| Full-Text Search | SQLite FTS5 with Porter stemmer |
| Knowledge Graph | SQLite facts table (or Neo4j in Docker mode) |
| Embeddings | Ollama `nomic-embed-text` (768-dim, CPU-optimized) |
| LLM | Ollama `llama3.1:8b` primary — Groq fallback |
| MCP | `@modelcontextprotocol/sdk` v1.29+ (stdio transport) |
| Dashboard | React 19, Vite 7, D3.js v7 |
| Static Serving | sirv (served from same process as the API) |
| Security | Helmet, express-rate-limit |

---

## Privacy and Security

GLIA was designed with a local-first philosophy from the ground up. Your conversations never leave your machine unless you explicitly configure a cloud LLM.

| Control | Detail |
|:---|:---|
| **Local Storage** | All data lives in `glia.db` on your machine or in local Docker volumes. Nothing syncs to any external service. |
| **Local Embeddings** | `nomic-embed-text` runs entirely via Ollama — zero API calls for embeddings. |
| **Local Extraction** | `llama3.1:8b` runs via Ollama for knowledge graph extraction. Groq is only used as a fallback and only if you provide a key. |
| **PII Scrubbing** | API keys, JWTs, connection strings, email addresses, and internal IPs are redacted to `[REDACTED]` in the browser before any data is sent to the backend. |
| **Injection Defence** | Retrieved chunks are scanned for 10 known prompt injection patterns before being injected into any prompt. Matching content is replaced with `[Content redacted]`. |
| **CORS Locked** | The backend rejects requests from any origin other than `localhost`. |
| **Security Headers** | Helmet adds `CSP`, `X-Frame-Options`, `X-Content-Type-Options`, and other headers to every response. |
| **No Shared Secret** | The pre-v1.4.7 shared secret requirement has been removed. The extension communicates directly with the local backend. |

See [SECURITY.md](SECURITY.md) for the full threat model and vulnerability reporting policy.

---

## What's New in v1.5.1

- **100% Project Isolation** — MCP sessions are permanently anchored to project names. Cross-tenant memory leakage is architecturally impossible.
- **Sentence Indexing Fixed** — Resolved a background worker payload mismatch that silently prevented sentence-level vectors from being stored.
- **Delete-then-Insert** — Migrated vector updates to a conflict-safe pattern, eliminating SQLite virtual table `UNIQUE` constraint failures on re-save.
- **WAL Mode** — Write-Ahead Logging enabled by default for all SQLite storage, enabling safe concurrent access from the MCP server and HTTP backend.
- **Interface Parity** — Added `hybridSearch` to the `IVectorStore` interface, ensuring both Docker and SQLite backends expose the same API surface.
- **Zero-Docker Documented** — Updated `MCP_SETUP.md` and `.env.example` to fully document the SQLite storage mode for new users.
- **Global Version Sync** — Synchronized v1.5.1 across all package files, manifests, startup scripts, source comments, and documentation.

See [CHANGELOG.md](CHANGELOG.md) for the full history.

---

## Documentation

| File | Description |
|:---|:---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, storage schema, environment variables |
| [RAG_PIPELINE.md](RAG_PIPELINE.md) | Retrieval pipeline, scoring, threshold tuning |
| [MCP_SETUP.md](MCP_SETUP.md) | MCP setup guide for all supported tools |
| [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md) | DOM resolver system, adding new platforms |
| [SECURITY.md](SECURITY.md) | Threat model, vulnerability reporting |
| [SELF_HOSTING.md](SELF_HOSTING.md) | Ports, passwords, backups, reverse proxy |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Fork workflow, commit format, adding platforms |
| [CHANGELOG.md](CHANGELOG.md) | Full version history |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and fixes |

---

## Contributing

Bug fixes, new platform support, UI improvements, and test coverage are all welcome.

[Contributing Guide](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

Good first issues: [`good first issue`](https://github.com/Eshaan-Nair/Glia-AI/issues?q=is%3Aissue+label%3A%22good+first+issue%22)

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
<br/>

**Stop re-explaining yourself. Give your AI the memory it should have had from day one.**

*Built by [Eshaan Nair](https://github.com/Eshaan-Nair)*

</div>
