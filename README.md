<div align="center">

<br/>

# SYNQ

### The Context Sovereignty Engine

*Your AI forgets everything. SYNQ remembers.*

<br/>

[![Stars](https://img.shields.io/github/stars/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=0B0E14&color=6366F1)](https://github.com/Eshaan-Nair/Synq/stargazers)
[![Forks](https://img.shields.io/github/forks/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=0B0E14&color=06B6D4)](https://github.com/Eshaan-Nair/Synq/forks)
[![Issues](https://img.shields.io/github/issues/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Synq/issues)
[![Last Commit](https://img.shields.io/github/last-commit/Eshaan-Nair/Synq?style=for-the-badge&labelColor=0B0E14&color=6366F1)](https://github.com/Eshaan-Nair/Synq/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-F8FAFC?style=for-the-badge&labelColor=0B0E14)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Eshaan-Nair/Synq/ci.yml?style=for-the-badge&label=CI&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Synq/actions)

<br/>

[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-6366F1?style=flat-square&logo=googlechrome&logoColor=white&labelColor=0B0E14)](https://github.com/Eshaan-Nair/Synq)
[![Neo4j](https://img.shields.io/badge/Graph_DB-Neo4j-06B6D4?style=flat-square&logo=neo4j&logoColor=white&labelColor=0B0E14)](https://neo4j.com)
[![ChromaDB](https://img.shields.io/badge/Vector_DB-ChromaDB-02C39A?style=flat-square&logo=databricks&logoColor=white&labelColor=0B0E14)](https://trychroma.com)
[![Groq](https://img.shields.io/badge/AI-Groq_LLaMA_3.1-F8FAFC?style=flat-square&labelColor=0B0E14&color=475569)](https://groq.com)
[![React](https://img.shields.io/badge/Dashboard-React_19-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=0B0E14)](https://react.dev)

<br/>

**Supports Claude · ChatGPT · Gemini**

<br/>

> Demo GIF coming soon.

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [What is SYNQ?](#what-is-synq)
- [What's New in v1.3](#whats-new-in-v13)
- [Features](#features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Architecture](#architecture)
- [Self-Hosting](#self-hosting)
- [Contributing](#contributing)
- [Privacy & Security](#privacy--security)
- [License](#license)

---

## The Problem

You're deep into a complex project. You've had 12 conversations with Claude about your architecture, your auth flow, your database schema, and the obscure bug you finally cracked at 2 AM. Real decisions. Real progress.

Then you open a new chat. **And it's all gone.**

You spend the next 20 minutes re-explaining your stack, what you decided last session, and what you already tried. Every session starts from zero. You're not talking to an AI with memory — you're talking to a stranger who happens to be very smart.

SYNQ was built to eliminate this friction entirely.

---

## What is SYNQ?

SYNQ is a **Chrome extension + local backend** that gives your AI assistant persistent, long-term memory. It captures every conversation, distills it into a semantic knowledge graph, and automatically injects highly relevant context back into your next prompt — using a zero-loss Sliding Window RAG pipeline.

**Before SYNQ:**
```
New chat → explain stack → explain decisions → explain status → 20 min → finally working
```

**After SYNQ:**
```
New chat → auto-connect → AI already knows everything → start working immediately
```

When you type a prompt, SYNQ silently prepends the most relevant historical context:

```
[SYNQ: Relevant context from your previous session]
### Context 1 (relevance: 87%)
We decided to use Mongoose for the ODM and React Query for server state.
The JWT refresh flow is currently blocked by a frontend state bug.
[END SYNQ CONTEXT]

How do we fix the refresh token issue?
```

The AI responds as if it was in the conversation with you the whole time.

---

## What's New in v1.3

### Zero-Loss RAG Pipeline

The old Groq-based topic splitter was lossy — it silently discarded personal facts and rejected short messages. v1.2 replaced it with a pure Sliding Window chunker:

| | Groq Topic Splitter (v1.0) | Sliding Window (v1.2+) |
|---|---|---|
| Personal facts | Deleted as "filler" | Preserved as-is |
| Short messages | Rejected | Always included |
| API call on save | Yes (1–3s) | None (0ms) |
| Information loss | Significant | **Zero** |

### Auto-Connect

No more manual Connect button. When you open a supported AI platform with an active session, SYNQ's context interceptor attaches automatically. Just type.

### Expanded Knowledge Graph

Entity types expanded from 12 to 22, now capturing personal facts: `Person · Pet · Goal · Problem · Preference · Habit · Location · Organization · Tool · Pattern`

### Graph Visualization

Nodes sized by connection degree (8–60px radius), curved bezier edges, hover-reveal edge labels, per-type colored glow filters, 3D radial gradients.

### Dashboard UI Overhaul

Color-coded Chat Viewer, skeleton loading states, user-visible error banner, Outfit font for the SYNQ logo. All React Hook lint errors resolved.

---

## Features

| Feature | Description |
|:---|:---|
| **Auto-Connect RAG** | Intercepts every prompt and prepends relevant context. Zero manual steps. |
| **100% Data Fidelity** | Sliding Window chunker — every word preserved, nothing filtered. |
| **Fully Local & Private** | Ollama, ChromaDB, and Neo4j run strictly on your machine. |
| **Privacy Scrubbing** | API keys, JWTs, emails, connection strings auto-redacted before processing. |
| **Knowledge Graph** | Semantic triples visualized with D3.js, sized by connection degree. |
| **Pause Toggle** | Suspend context injection without losing session state. |
| **Multi-Platform** | Claude, ChatGPT, Gemini supported simultaneously. |
| **Chat Viewer** | Saved conversations with color-coded user/assistant bubbles. |
| **Graceful Degradation** | If Groq is down, RAG and storage continue. Only graph extraction skipped. |

---

## How It Works

```
  1. CAPTURE
     Finish a chat → click Save Chat in the extension popup
     Extension scrapes full conversation (user + AI turns)
     FNV-1a fingerprint deduplication prevents double-saves
                      │
  2. PRIVACY SCRUB
     Secrets → [REDACTED] before anything leaves the browser
                      │
  3. DUAL-TRACK STORAGE
     ├── Vector Track (RAG):
     │     Sliding window chunker (300-word windows, 80-word overlap)
     │     → Ollama nomic-embed-text embeddings (parallel)
     │     → ChromaDB collection synq_chunks_v2
     │
     └── Graph Track (Visualization):
           Groq LLaMA 3.1 → summarize facts → extract triples
           → Neo4j MERGE (idempotent, no duplicates)
                      │
  4. AUTO-CONNECT (RAG)
     Open new chat → interceptor auto-attaches
     Type prompt → cosine search ChromaDB
     → score = 1 - cosine_distance, threshold ≥ 0.30
     → top-3 chunks prepended to prompt → auto-sent
```

Full pipeline details: [RAG_PIPELINE.md](RAG_PIPELINE.md) · Full architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| **Extension** | TypeScript, Chrome Manifest V3, Shadow DOM |
| **Backend API** | Node.js, Express 5, TypeScript |
| **Graph Database** | Neo4j 5.18 |
| **Vector Database** | ChromaDB 0.6.3 (cosine similarity, local) |
| **Embeddings** | Ollama `nomic-embed-text` (768 dimensions, CPU) |
| **LLM Processing** | Groq LLaMA 3.1 8B Instant (free tier) |
| **Dashboard UI** | React 19, Vite 7, D3.js v7 |
| **Infrastructure** | Docker Compose |
| **Testing** | Jest + ts-jest |
| **CI/CD** | GitHub Actions |

---

## Quick Start

### Prerequisites

- [Node.js 20 LTS](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (WSL2 required on Windows)
- [Ollama](https://ollama.com) — after installing: `ollama pull nomic-embed-text`
- [Groq API Key](https://console.groq.com) — free, no credit card required

### 1. Clone & Start Databases

```bash
git clone https://github.com/Eshaan-Nair/Synq.git
cd Synq
docker compose up -d
```

### 2. Configure Backend

```bash
# macOS / Linux
cp backend/.env.example backend/.env

# Windows
copy backend\.env.example backend\.env
```

Open `backend/.env` and set your `GROQ_API_KEY`. All other values have working local defaults.

### 3. Start Everything

```bash
# macOS / Linux
chmod +x start.sh && ./start.sh

# Windows
start.bat
```

Or manually in separate terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd backend && npm install && npm run dev

# Terminal 2 — Dashboard (port 5173)
cd dashboard && npm install && npm run dev
```

### 4. Load the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `Synq/extension` folder
4. The **SYNQ** badge appears bottom-right on Claude, ChatGPT, and Gemini

---

## Usage Guide

### Saving a Conversation

1. Finish a conversation on Claude, ChatGPT, or Gemini
2. Click the SYNQ extension icon in the Chrome toolbar
3. Enter a project name (e.g., `AuthService v2`) and click **Save Chat**
4. SYNQ scrubs PII, chunks the conversation, embeds it, and stores everything locally — typically under 5 seconds

### Auto-Connect (RAG)

Once a session is saved, SYNQ auto-connects on the next page load. Open a new chat and type normally. SYNQ searches its vector store and prepends the most relevant context chunks before the prompt is sent.

To pause injection: click **Pause SYNQ** in the popup. Your session remains active.

### Classic Inject

For starting a fresh chat from scratch, use **Inject Context (one-time)** in the popup. This pulls the structured project summary from the knowledge graph and pastes it into the input.

### Dashboard

Open `http://localhost:5173`:

- **Graph tab** — D3.js force graph, hover to reveal edge labels and connections
- **History tab** — full list of extracted semantic triples with timestamps
- **Chat tab** — raw conversation with color-coded user/assistant bubbles

Click **Load into Extension** to set any session as active across all open AI tabs.

---

## Architecture

```
SYNQ/
├── .github/
│   ├── ISSUE_TEMPLATE/     # bug_report.md, feature_request.md
│   └── workflows/ci.yml
├── backend/
│   └── src/
│       ├── routes/         # chat.ts, context.ts, graph.ts, rag.ts
│       ├── services/       # chroma.ts, chunker.ts, embeddings.ts,
│       │                   # extractor.ts, mongo.ts, neo4j.ts
│       └── utils/          # logger.ts, privacy.ts
├── dashboard/
│   └── src/
│       ├── api/            # rag.ts, synq.ts
│       ├── components/     # ChatViewer.tsx, GraphView.tsx
│       └── App.tsx
├── extension/
│   ├── popup/              # popup.html, popup.ts, popup.css
│   └── src/
│       ├── platforms/      # claude.ts, chatgpt.ts, gemini.ts, index.ts
│       ├── content.ts
│       └── background.ts
├── scripts/
│   └── check-selectors.js
├── docker-compose.yml
└── start.sh / start.bat
```

### Service Ports

| Service | Port | Purpose |
|---|---|---|
| Backend | 3001 | Express API |
| Neo4j | 7474 / 7687 | Knowledge graph |
| MongoDB | 27017 | Sessions + chat storage |
| ChromaDB | 8000 | Vector store |
| Ollama | 11434 | Local embeddings |
| Dashboard | 5173 | React dev server |

---

## Self-Hosting

All data stays in local Docker volumes. Nothing syncs externally except text sent to Groq for graph extraction — and that is PII-scrubbed first.

See [SELF_HOSTING.md](SELF_HOSTING.md) for port configuration, custom passwords, backup commands, and reverse proxy setup.

---

## Contributing

Contributions welcome — bug fixes, new platform support, UI improvements, and documentation.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the fork/clone/branch workflow, commit format, and the step-by-step guide for adding a new AI platform.

Also review the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Privacy & Security

- **Your data stays local.** All conversation data, vectors, and graph triples are stored in local Docker volumes.
- **Auto-redaction.** Secrets are scrubbed before any text reaches Groq.
- **Opt-in only.** SYNQ reads the DOM only when you save a chat or when Auto-Connect processes a prompt. No telemetry.
- **Rate limiting.** 200 req/min global; 10 req/min on `/api/chat/save`.
- **CORS locked.** Only `localhost:5173`, `localhost:4173`, and `chrome-extension://` origins allowed.

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

---

## License

MIT — see [LICENSE](LICENSE).

<div align="center">
<br/>
<b>Built by a developer, for developers.</b><br/>
<br/><br/>
</div>