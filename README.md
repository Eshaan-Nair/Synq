<div align="center">

# SYNQ

### Your AI forgets. SYNQ makes it remember.

Every time you open a new chat, your AI starts from zero. You re-explain your stack, your decisions, your bugs — over and over. **SYNQ eliminates this permanently** by giving your AI assistant persistent, cross-session memory.

<br/>

[![Stars](https://img.shields.io/github/stars/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=0B0E14&color=6366F1)](https://github.com/Eshaan-Nair/Synq/stargazers)
[![Forks](https://img.shields.io/github/forks/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=0B0E14&color=06B6D4)](https://github.com/Eshaan-Nair/Synq/forks)
[![Issues](https://img.shields.io/github/issues/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Synq/issues)
[![CI](https://img.shields.io/github/actions/workflow/status/Eshaan-Nair/Synq/ci.yml?style=for-the-badge&label=CI&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Synq/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-F8FAFC?style=for-the-badge&labelColor=0B0E14)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-6366F1?style=for-the-badge&labelColor=0B0E14)](CHANGELOG.md)

<br/>

<table>
<tr>
<td align="center"><img src="https://img.shields.io/badge/Chrome-MV3-6366F1?style=flat-square&logo=googlechrome&logoColor=white&labelColor=0B0E14" alt="Chrome"/></td>
<td align="center"><img src="https://img.shields.io/badge/Neo4j-5.18-06B6D4?style=flat-square&logo=neo4j&logoColor=white&labelColor=0B0E14" alt="Neo4j"/></td>
<td align="center"><img src="https://img.shields.io/badge/ChromaDB-0.6.3-02C39A?style=flat-square&logo=databricks&logoColor=white&labelColor=0B0E14" alt="ChromaDB"/></td>
<td align="center"><img src="https://img.shields.io/badge/Groq-LLaMA_3.1-F8FAFC?style=flat-square&labelColor=0B0E14" alt="Groq"/></td>
<td align="center"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=0B0E14" alt="React"/></td>
<td align="center"><img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0B0E14" alt="TypeScript"/></td>
</tr>
</table>

**Works with Claude · ChatGPT · Gemini — simultaneously, on the same machine.**

*Switch accounts. Switch AIs. Switch chats. SYNQ still remembers everything.*


https://github.com/user-attachments/assets/ab003d01-3e36-405c-a7a4-9eae417b77ca


</div>

---

## The Problem

You're deep into a complex project. You've had 12 conversations with Claude about your architecture, your auth flow, your database schema, and the obscure bug you cracked at 2 AM.

Then you open a new chat.

**It's all gone.** You spend the next 20 minutes re-explaining your stack, what you decided, what you already tried. Every conversation starts from zero. You're not talking to an AI with memory — you're talking to a stranger who happens to be very smart.

## The Solution

SYNQ is a **Chrome extension + local backend** that captures your conversations, distills them into a semantic knowledge graph, and **automatically injects the most relevant context into every new prompt** — using a zero-loss RAG pipeline.

```
 Without SYNQ                           With SYNQ
 ─────────────────────────────          ─────────────────────────────
 New chat → blank slate                 New chat → instant context
 Re-explain your stack                  AI already knows your stack
 Re-explain your decisions              AI remembers your decisions
 Re-explain what you tried              AI recalls past attempts
 20 minutes wasted                      Start working immediately
```

When you type a prompt, SYNQ silently prepends the most relevant context from your history:

```
[SYNQ: Relevant context from your previous session]
### Context 1 (relevance: 87%)
We decided to use Mongoose for the ODM and React Query for server state.
The JWT refresh flow is currently blocked by a frontend state bug.
[END SYNQ CONTEXT]

How do we fix the refresh token issue?
```

**The AI responds as if it was in every conversation with you from the start.**

---

## Table of Contents

- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Tech Stack](#tech-stack)
- [Privacy & Security](#privacy--security)
- [What's New in v1.3](#whats-new-in-v13)
- [Self-Hosting](#self-hosting)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

<table>
<tr>
<td width="50%">

### Auto-Connect RAG
Intercepts every prompt and injects relevant context automatically. Zero manual steps after initial setup.

### 100% Local & Private
Ollama, ChromaDB, and Neo4j run on your machine. Your data never leaves your network.

### Zero Data Loss
Sliding window chunker preserves every word — no filtering, no minimum length, no information dropped.

### Privacy Scrubbing
API keys, JWTs, emails, connection strings auto-redacted before any text reaches external services.

</td>
<td width="50%">

### Semantic Knowledge Graph
22 entity types, 20+ relation types — captures both technical architecture and personal context.

### D3.js Graph Visualization
Force-directed graph with degree-scaled nodes, curved edges, hover tooltips, and zoom controls.

### ⏯Pause / Resume Toggle
Suspend context injection without losing session state. Resume instantly when ready.

### Multi-Platform
Claude, ChatGPT, and Gemini — all supported simultaneously with platform-specific selectors.

</td>
</tr>
</table>

---

## How It Works

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  1. CAPTURE                                                     │
  │     Finish a chat → click Save Chat in the extension popup      │
  │     Extension scrapes full conversation (user + AI turns)       │
  │     FNV-1a fingerprint deduplication prevents double-saves      │
  └─────────────────────────┬───────────────────────────────────────┘
                            │
  ┌─────────────────────────▼───────────────────────────────────────┐
  │  2. PRIVACY SCRUB                                               │
  │     API keys, JWTs, emails, connection strings → [REDACTED]     │
  │     Happens in the browser before anything is transmitted       │
  └─────────────────────────┬───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
  ┌───────────▼──────────┐   ┌────────────▼─────────────┐
  │  3A. VECTOR TRACK    │   │  3B. GRAPH TRACK         │
  │  (RAG — all local)   │   │  (Knowledge Graph)       │
  │                      │   │                          │
  │  Sliding window      │   │  Groq LLaMA 3.1 →       │
  │  chunker (300w/80ov) │   │  summarize facts →       │
  │  → Ollama embeddings │   │  extract triples →       │
  │  → ChromaDB cosine   │   │  Neo4j MERGE             │
  └───────────┬──────────┘   └────────────┬─────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
  ┌─────────────────────────▼───────────────────────────────────────┐
  │  4. AUTO-CONNECT (every prompt, automatically)                  │
  │     User types → intercepted → ChromaDB cosine search →        │
  │     Top-3 chunks prepended to prompt → AI gets full context     │
  └─────────────────────────────────────────────────────────────────┘
```

> **Full pipeline details:** [RAG_PIPELINE.md](RAG_PIPELINE.md) · **Architecture deep-dive:** [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Architecture

```
SYNQ/
├── backend/
│   └── src/
│       ├── routes/             # chat · context · graph · rag
│       ├── services/           # chroma · chunker · embeddings
│       │                       # extractor · mongo · neo4j
│       └── utils/              # logger · privacy
├── dashboard/
│   └── src/
│       ├── api/                # rag · synq
│       ├── components/         # ChatViewer · GraphView
│       └── App.tsx
├── extension/
│   ├── popup/                  # popup.html · popup.ts · popup.css
│   └── src/
│       ├── platforms/          # claude · chatgpt · gemini · index
│       ├── content.ts          # DOM scraping, prompt interception
│       └── background.ts       # service worker, backend proxy
├── scripts/
│   └── check-selectors.js      # Playwright smoke test
├── docker-compose.yml          # Neo4j + MongoDB + ChromaDB
└── start.sh / start.bat        # One-command launcher
```

### Service Map

| Service | Port | Purpose |
|:---|:---|:---|
| **Backend** | `3001` | Express API — routes, rate limiting, security headers |
| **Neo4j** | `7474` / `7687` | Knowledge graph — HTTP browser + Bolt protocol |
| **MongoDB** | `27017` | Sessions, FullChat storage, active session singleton |
| **ChromaDB** | `8000` | Vector store — cosine similarity with nomic-embed-text |
| **Ollama** | `11434` | Local embedding generation — 768-dim vectors |
| **Dashboard** | `5173` | React dev server — graph visualization, session management |

---

## Quick Start

### Prerequisites

| Requirement | Link |
|:---|:---|
| **Node.js 20 LTS** | [nodejs.org](https://nodejs.org) |
| **Docker Desktop** | [docker.com](https://www.docker.com/products/docker-desktop) (WSL2 on Windows) |
| **Ollama** | [ollama.com](https://ollama.com) — then run `ollama pull nomic-embed-text` |
| **Groq API Key** | [console.groq.com](https://console.groq.com) — free, no credit card |

### 1. Clone & Configure

```bash
git clone https://github.com/Eshaan-Nair/Synq.git
cd Synq

# macOS / Linux
cp backend/.env.example backend/.env

# Windows
copy backend\.env.example backend\.env
```

Open `backend/.env` and set your `GROQ_API_KEY`. All other values have working local defaults.

### 2. Start Everything (One Command)

```bash
# macOS / Linux
chmod +x start.sh && ./start.sh

# Windows
start.bat
```

The start script will:
- ✅ Check for Ollama and pull `nomic-embed-text` if missing
- ✅ Start Docker containers (Neo4j + MongoDB + ChromaDB)
- ✅ Install dependencies and build the extension
- ✅ Launch backend (port 3001) and dashboard (port 5173)
- ✅ Health-check the backend before proceeding

### 3. Load the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** → select the `Synq/extension` folder
4. The **SYNQ** icon appears in your toolbar

Open Claude, ChatGPT, or Gemini — the SYNQ badge appears automatically.

<details>
<summary><strong>Alternative: Manual Setup (separate terminals)</strong></summary>

```bash
# Terminal 1 — Backend
cd backend && npm install && npm run dev

# Terminal 2 — Dashboard
cd dashboard && npm install && npm run dev

# Build extension (one time)
cd extension && npm install && npm run build

# Start databases
docker compose up -d

# Start Ollama (if not running)
ollama serve
```

</details>

---

## Usage Guide

### Saving a Conversation

1. Have a conversation on Claude, ChatGPT, or Gemini
2. Click the **SYNQ** icon in the Chrome toolbar
3. Enter a project name (e.g., `AuthService v2`) and click **Save Chat**
4. SYNQ scrubs PII, chunks the conversation, embeds it locally, and runs graph extraction — typically under 5 seconds

### Auto-Connect (RAG) — The Main Workflow

Once a session is saved and active, **SYNQ auto-connects every time you open a supported platform**. Type your next prompt normally — SYNQ searches its vector store and prepends the most relevant context before sending.

**To pause** injection without losing your session: click **Pause SYNQ** in the popup.

### Classic Inject — For Cold Starts

Click **Inject Context (one-time)** in the popup. SYNQ pulls the structured project summary from the knowledge graph and pastes it directly into the chat input — you send it manually to prime the conversation.

### Dashboard

Open **http://localhost:5173** to access:

| Tab | What It Shows |
|:---|:---|
| **Graph** | Interactive D3.js force graph — hover nodes to see connections and labels |
| **History** | All extracted semantic triples with timestamps, newest first |
| **Chat** | Full saved conversation with color-coded user/assistant bubbles |

Use **Load into Extension** to set any session as the active context across all open AI tabs.

---

## Tech Stack

| Layer | Technology | Notes |
|:---|:---|:---|
| **Extension** | TypeScript, Chrome Manifest V3 | Content scripts, service worker, Shadow DOM |
| **Backend API** | Node.js, Express 5, TypeScript | Rate limiting, helmet, CORS, input validation |
| **Graph Database** | Neo4j 5.18 | Typed triples, MERGE idempotency |
| **Vector Database** | ChromaDB 0.6.3 (cosine) | Local, persistent, pinned version |
| **Embeddings** | Ollama `nomic-embed-text` | 768-dim, CPU-only, ~270MB, parallel generation |
| **LLM Processing** | Groq LLaMA 3.1 8B Instant | Free tier, fact extraction + graph summarization |
| **Dashboard UI** | React 19, Vite 7, D3.js v7 | Force graph, TypeScript strict mode |
| **Infrastructure** | Docker Compose | Named volumes, pinned image versions |
| **Testing** | Jest + ts-jest | Unit tests for chunker, privacy scrubber, RAG |
| **CI/CD** | GitHub Actions | Backend build+test, dashboard build, extension build |

---

## Privacy & Security

**Your data stays on your machine.** All conversation data, embeddings, and graph triples are stored in local Docker volumes. Nothing syncs externally.

The only external service is **Groq**, used solely for graph triple extraction — and the text sent there is PII-scrubbed first. RAG chunking, embedding, and retrieval are 100% local.

| Control | Implementation |
|:---|:---|
| **Auto-redaction** | API keys, JWTs, emails, connection strings scrubbed before transmission |
| **Rate limiting** | 200 req/min global · 10 req/min on `/api/chat/save` |
| **CORS locked** | Only `localhost:5173`, `localhost:4173`, and `chrome-extension://` |
| **Input validation** | All routes validate sessionId, platform, text length |
| **Helmet headers** | Security headers on every response |
| **Shared secret** | Optional `X-SYNQ-Secret` header for request authentication |
| **Opt-in only** | SYNQ reads the DOM only when you save a chat or Auto-Connect is active |

> See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

---

## What's New in v1.3

### Zero-Loss RAG Pipeline

The v1.0 Groq-based topic splitter was **lossy** — it silently discarded personal facts and rejected short messages. v1.2 replaced it entirely:

| | Groq Topic Splitter (v1.0) | Sliding Window Chunker (v1.2+) |
|:---|:---|:---|
| Personal facts ("my dog is Noob") | ❌ Deleted as "filler" | ✅ Preserved verbatim |
| Short messages | ❌ Rejected | ✅ Always included |
| API call on save | ❌ Yes (1–3s, costs quota) | ✅ None (pure function) |
| Information loss | ❌ Significant | ✅ **Zero** |

### Auto-Connect

No more manual Connect button. Open a supported AI platform with an active session and the interceptor **auto-attaches**. Just type — SYNQ handles the rest.

### Knowledge Graph Expansion

Entity types grew from 12 → 22, now capturing the full picture:

`Project · Technology · Feature · Bug · Decision · Concept · Library · API · Database · Framework · Auth · Architecture · Person · Pet · Goal · Problem · Preference · Habit · Location · Organization · Tool · Pattern`

### Graph Visualization Overhaul

- Degree-scaled nodes (8–60px radius) — hubs are visually dominant
- Curved quadratic bezier edges with hover-reveal labels
- Per-type colored glow filters and 3D radial gradients
- Hover tooltip with name, type, and connection count
- Zoom controls (+/−/reset)

> See [CHANGELOG.md](CHANGELOG.md) for the full history.

---

## Self-Hosting

All data lives in local Docker volumes. For custom passwords, port changes, backups, data reset, and reverse proxy configuration:

**[Self-Hosting Guide →](SELF_HOSTING.md)**

---

## Contributing

Contributions are welcome — bug fixes, new platform support, UI improvements, documentation, and test coverage.

**[Contributing Guide →](CONTRIBUTING.md)** — fork/clone/branch workflow, commit format, and step-by-step guide for adding a new AI platform.

**[Code of Conduct →](CODE_OF_CONDUCT.md)**

**Good first issues** are tagged [`good first issue`](https://github.com/Eshaan-Nair/Synq/issues?q=is%3Aissue+label%3A%22good+first+issue%22) in the issue tracker.

---

## Documentation

| Document | Description |
|:---|:---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full architecture, data flow, security model, data models |
| [RAG_PIPELINE.md](RAG_PIPELINE.md) | Pipeline details, similarity scoring, tuning parameters |
| [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md) | Per-platform CSS selectors and staleness tracking |
| [SELF_HOSTING.md](SELF_HOSTING.md) | Ports, passwords, backups, reverse proxy setup |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Fork workflow, commit format, adding new platforms |
| [CHANGELOG.md](CHANGELOG.md) | Full version history |

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
<br/>

**Stop re-explaining yourself.**
**Give your AI the memory it should have had from day one.**

<br/>

*Built by [Eshaan Nair](https://github.com/Eshaan-Nair) — a developer, for developers.*


</div>
