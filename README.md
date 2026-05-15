<div align="center">

# GLIA — The Memory Layer for AI

### Your AI forgets. GLIA makes it remember.
**Turn transient chats into a persistent, searchable knowledge base. Works locally, privately, and automatically.**

<br/>

[![Stars](https://img.shields.io/github/stars/Eshaan-Nair/Glia-AI?style=for-the-badge&logo=github&labelColor=0B0E14&color=6366F1)](https://github.com/Eshaan-Nair/Glia-AI/stargazers)
[![Forks](https://img.shields.io/github/forks/Eshaan-Nair/Glia-AI?style=for-the-badge&logo=github&labelColor=0B0E14&color=06B6D4)](https://github.com/Eshaan-Nair/Glia-AI/forks)
[![Issues](https://img.shields.io/github/issues/Eshaan-Nair/Glia-AI?style=for-the-badge&logo=github&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Glia-AI/issues)
[![Downloads](https://img.shields.io/npm/dt/glia-ai-setup?style=for-the-badge&logo=npm&labelColor=0B0E14&color=CB3837)](https://www.npmjs.com/package/glia-ai-setup)
[![CI](https://img.shields.io/github/actions/workflow/status/Eshaan-Nair/Glia-AI/integration-tests.yml?style=for-the-badge&label=CI&labelColor=0B0E14&color=02C39A)](https://github.com/Eshaan-Nair/Glia-AI/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-F8FAFC?style=for-the-badge&labelColor=0B0E14)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.5.0-6366F1?style=for-the-badge&labelColor=0B0E14)](CHANGELOG.md)

<br/>

**Works with:**
**Claude, ChatGPT, Gemini, DeepSeek**
**— and Claude Code · Cursor · Windsurf via MCP.**

https://github.com/user-attachments/assets/ab003d01-3e36-405c-a7a4-9eae417b77ca

<br/>

### Get Started Instantly
```bash
npx glia-ai-setup
```

</div>

---

## The Problem

You're deep into a complex project. You've had dozens of conversations with Claude about your architecture, auth flow, and database schema. Then you open a new chat — **it's all gone.** You spend the next 10 minutes re-explaining context you've already covered.

GLIA stops the cycle. It captures your conversations, distills them into a semantic knowledge graph, and **automatically injects the most relevant context into every new prompt**.

---

## Table of Contents

- [Key Features](#key-features)
- [System Requirements](#system-requirements)
- [Quick Start](#quick-start)
- [MCP Server](#mcp-server)
- [Usage Guide](#usage-guide)
- [How It Works](#how-it-works)
- [Performance Benchmarks (Web Dashboard)](#performance-benchmarks-web-dashboard)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Privacy and Security](#privacy-and-security)
- [Whats New in v1.5.0](#whats-new-in-v150)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

| Feature | Description |
|:---|:---|
| **Hybrid Search RAG** | Combines Vector search with Knowledge Graph facts for 2x better accuracy |
| **Auto-Connect** | Intercepts every prompt and injects relevant context automatically |
| **100% Local** | Ollama runs embeddings and extraction on your machine — nothing leaves your network |
| **Zero Data Loss** | Sliding window chunker preserves every word — no filtering, no minimum length |
| **Injection Defence** | Chunks scanned for injection patterns; context wrapped in professional headers |
| **Knowledge Graph** | 22 entity types, 20+ relation types — captures technical and personal context |
| **D3.js Dashboard** | Force-directed graph with degree-scaled nodes, hover tooltips, zoom controls |
| **MCP Evolution** | Smart project detection + Hybrid recall in Claude Code, Cursor, Windsurf |
| **Resilient Selectors** | 5-strategy fallback per platform; weekly CI detects when selectors go stale |
| **Lite Mode** | Runs on 4 GB RAM machines — skips Neo4j, RAG still works fully |

---

## System Requirements

| Mode | RAM | Disk | Docker? | What runs |
|:---|:---|:---|:---|:---|
| **Full** | 8 GB+ | 15 GB+ | Required | All features — Neo4j, MongoDB, ChromaDB, Ollama |
| **Lite** | 4 GB+ | 10 GB+ | Required | RAG only — MongoDB, ChromaDB (no knowledge graph) |
| **SQLite** | 2 GB+ | 5 GB+ | ❌ Not needed | All features — single `.db` file + Ollama |

### No Docker? Use SQLite Mode

Set `GLIA_STORAGE_MODE=sqlite` in `backend/.env` before starting.
The installer detects Docker automatically and sets this for you if Docker is missing.

All launchers (`start.bat`, `start.sh`, `install.bat`, `install.sh`) auto-detect RAM and choose the right mode. Override with `GLIA_PROFILE=full` or `GLIA_PROFILE=lite`.

---

## Quick Start

### Prerequisites

| Requirement | Version | Link |
|:---|:---|:---|
| Docker Desktop | 24.0+ | [docker.com](https://www.docker.com/products/docker-desktop) — enable WSL2 on Windows |
| Node.js | 20 LTS+ | [nodejs.org](https://nodejs.org) |
| Ollama | Latest | [ollama.com](https://ollama.com) |
| Groq API Key | — | [console.groq.com](https://console.groq.com) — free, only needed if Ollama is unavailable |

### First-time Setup

**Option A: The One-Command Way (Recommended)**
```bash
npx glia-ai-setup
```
This script handles everything: clones the latest release (if needed), verifies dependencies, and triggers the interactive installer. This is the **strongly recommended** path for all users.

**Option B: Manual Setup (Windows)** — double-click `install.bat`
```
Checks Docker + Node.js, opens Ollama download if missing,
pulls models, installs npm deps, builds all packages,
detects RAM, starts Docker with the correct profile.

**Configure API Keys** (Optional)
Copy `backend/.env.example` to `backend/.env` and add your `GROQ_API_KEY` for faster extraction if Ollama is slow or unavailable.
```

# Recommended:
npx glia-ai-setup

### Daily Use

```
Windows:        start.bat
macOS/Linux:    ./start.sh
```

### Load the Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. **Load unpacked** → select `Glia-AI/extension/dist`
4. The GLIA badge appears on Claude, ChatGPT, Gemini, and DeepSeek

### Dashboard

Start the backend, then open **http://localhost:3001**

The dashboard is a production build served by the backend — no separate window needed.

---

## MCP Server

> **Unified Memory Layer** — GLIA acts as a bridge between your browser conversations and your local development environment.

Build the backend first:
```bash
cd backend && npm run build
```

### Quick Integration
Add to your AI tool's config to give it access to your entire conversation history:

**Claude Desktop** (`~/.claude/claude_desktop_config.json`):
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

**Cursor / Windsurf** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "glia": { "command": "node", "args": ["/path/to/Glia-AI/backend/dist/mcp/server.js"] }
  }
}
```

**Available Tools:**
- `recall_context` — Semantic search across the active project.
- `store_memory` — Manually save notes or code snippets.
- `search_memory` — Cross-project global search.
- `list_projects` — Manage your knowledge silos.
- `get_project_summary` — View the knowledge graph as structured data.

Full guide: [MCP_SETUP.md](MCP_SETUP.md)

---

## Usage Guide

### Saving a Conversation

1. Have a conversation on Claude, ChatGPT, Gemini, or DeepSeek
2. Click the GLIA icon in the toolbar
3. Enter a project name and click **Save Chat**
4. GLIA scrubs PII, chunks, embeds locally, and extracts graph triples — typically under 5 seconds

### Auto-Connect

Once a session is active, GLIA **auto-attaches on every page load**. Just type — context is prepended automatically. Click **Pause** in the popup to suspend. Click again to resume.

### Classic Inject

Click **Inject Context (one-time)** to paste the knowledge graph summary directly into the chat input for manual sending. Useful for priming a cold start.

### Dashboard

Open **http://localhost:3001**:

| Tab | Content |
|:---|:---|
| **Graph** | D3.js force graph — hover nodes for connections |
| **History** | All semantic triples with timestamps |
| **Chat** | Full conversation with color-coded bubbles |

---

## How It Works

```
1. CAPTURE
   Save Chat → scrape conversation → FNV-1a deduplication

2. PRIVACY SCRUB
   API keys, JWTs, emails, connection strings → [REDACTED]
   Done in the browser before transmission

3A. VECTOR TRACK                    3B. GRAPH TRACK
    Sliding window chunker               Ollama llama3.1:8b
    300 words / 80 overlap               (Groq fallback if unavailable)
    Ollama embeddings                    summarize → extract triples
    ChromaDB cosine storage              Neo4j MERGE

4. AUTO-CONNECT (every prompt)
   Intercept → ChromaDB cosine search
   → sanitizeChunks() — injection patterns redacted
   → wrapInContextBlock() — XML delimiters
   → top-3 chunks prepended → sent to AI
```

---

## Performance Benchmarks (Web Dashboard)

GLIA v1.5.0 features an elite-precision retrieval engine. We stress-test every release using a rigorous "Needle-in-a-Haystack" audit.

**Audit Scale:** 1,000 Chunks (~300,000 words) | **Needles:** 20 unique facts hidden at random | **Queries:** 60 natural language variations

| Metric | Performance | Description |
| :--- | :--- | :--- |
| **Recall @ 1** | **90.0%** | The correct fact was the absolute top result in 9 out of 10 searches. |
| **Context Compression** | **95.0%** | Average reduction in prompt noise (e.g., 55k characters trimmed to 2.7k). |
| **MRR** | **0.806** | Mean Reciprocal Rank (Search quality where 1.0 is a perfect snap). |

### Hybrid Engine Contribution
When a fact was successfully retrieved, which part of the engine found it?
- **Sentence Vector Hits:** 50
- **Chunk Vector Hits:** 47
- **FTS Keyword Hits:** 43 (Hybrid synergy at work)

*Note: Benchmarking for the MCP Toolchain context pipelines is conducted in a separate audit.*

---

## Architecture

```
Glia-AI/
├── backend/
│   ├── scripts/       benchmarking · stress testing · maintenance
│   ├── tests/         unit · integration · scratch
│   └── src/           core server logic
│       ├── mcp/       MCP server implementation
│       ├── middleware/ sanitization · auth
│       ├── routes/    api endpoints
│       ├── services/  vector · graph · storage
│       └── utils/     logging · privacy
├── dashboard/src/     React 19 + D3.js + Vite (built to dashboard/dist/)
├── extension/src/
│   ├── platform/      resolver.ts (multi-strategy selector engine)
│   ├── platforms/     claude · chatgpt · gemini · index
│   ├── content.ts     DOM scraping, prompt interception
│   └── background.ts  service worker, backend proxy
├── MCP_SETUP.md       MCP server setup guide
├── .github/workflows/ integration-tests · selector-check · release
├── docker-compose.yml          full profile
├── docker-compose.lite.yml     lite profile
├── install.bat / install.sh    first-time setup
└── start.bat / start.sh        daily launcher
```

### Ports

| Service | Port | Notes |
|:---|:---|:---|
| Backend + Dashboard | `3001` | API + sirv static serving |
| Neo4j | `7474` / `7687` | Full mode only |
| MongoDB | `27017` | Always |
| ChromaDB | `8000` | Always |
| Ollama | `11434` | Local AI |
| MCP Server | stdio | External tool integration |

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| Extension | TypeScript, Chrome MV3, esbuild |
| Backend | Node.js, Express 5, TypeScript |
| Knowledge graph | Neo4j 5.18 |
| Vector store | ChromaDB 0.6.3 (cosine) |
| Embeddings | Ollama `nomic-embed-text` (768-dim, CPU) |
| LLM | Ollama `llama3.1:8b` primary + Groq fallback |
| MCP | `@modelcontextprotocol/sdk` (stdio) |
| Dashboard | React 19, Vite 7, D3.js v7 |
| Static serving | sirv |
| Infrastructure | Docker Compose (full/lite profiles) |
| Testing | Jest + ts-jest, pipeline integration test |
| CI/CD | GitHub Actions — tests, selector check, auto-release |

---

## Privacy and Security

**GLIA was built with a local-first philosophy. Your conversations are your own.**

| Control | Detail |
|:---|:---|
| **Local-First** | All data lives in local Docker volumes. Nothing syncs to a cloud service. |
| **Local LLM** | Ollama is the primary backend. Your data stays on your silicon. |
| **PII Redaction** | Automated scrubbing of API keys, JWTs, and emails happens client-side. |
| **Sanitization** | RAG chunks are scanned for prompt injection patterns before injection. |
| **CORS Locked** | Backend only accepts requests from the dashboard and extension. |
| Security headers | helmet on every response |
| Shared secret | Removed in v1.4.7 |

See [SECURITY.md](SECURITY.md) for the full threat model and vulnerability reporting policy.

---

## Whats New in v1.5.0

- **Unified Versioning** — Full alignment across all components (Backend, Dashboard, Extension).
- **Standardized Context Header** — Switched to a leaner, token-efficient injection header.
- **Enhanced Documentation** — New [ROADMAP.md](ROADMAP.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
- **Frictionless Setup** — Improved `npx glia-ai-setup` reliability.

See [CHANGELOG.md](CHANGELOG.md) for the full history.

---

## Documentation

| File | Description |
|:---|:---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, security model, data models, env vars |
| [RAG_PIPELINE.md](RAG_PIPELINE.md) | Pipeline details, scoring, threshold tuning |
| [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md) | Selectors, resolver system, staleness guide |
| [MCP_SETUP.md](MCP_SETUP.md) | MCP setup for all supported AI tools |
| [ROADMAP.md](ROADMAP.md) | Versioned milestones |
| [SELF_HOSTING.md](SELF_HOSTING.md) | Ports, passwords, backups, reverse proxy |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Fork workflow, commit format, new platforms |
| [CHANGELOG.md](CHANGELOG.md) | Full version history |
| [SECURITY.md](SECURITY.md) | Threat model, vulnerability reporting |

---

## Contributing

Bug fixes, new platform support, UI improvements, documentation, and test coverage are all welcome.

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
