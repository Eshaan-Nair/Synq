<div align="center">

<h1>SYNQ</h1>
<h3>The Context Sovereignty Engine</h3>
<p><em>Your AI forgets everything. SYNQ remembers.</em></p>

<br/>

[![Stars](https://img.shields.io/github/stars/yourusername/synq?style=for-the-badge&logo=github&labelColor=021f2e&color=02C39A)](https://github.com/yourusername/synq/stargazers)
[![Forks](https://img.shields.io/github/forks/yourusername/synq?style=for-the-badge&logo=github&labelColor=021f2e&color=028090)](https://github.com/yourusername/synq/forks)
[![Issues](https://img.shields.io/github/issues/yourusername/synq?style=for-the-badge&logo=github&labelColor=021f2e&color=05668D)](https://github.com/yourusername/synq/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-F0F3BD?style=for-the-badge&labelColor=021f2e)](LICENSE)

<br/>

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-02C39A?style=flat-square&logo=googlechrome&logoColor=white&labelColor=021f2e)](https://github.com/yourusername/synq)
[![Neo4j](https://img.shields.io/badge/Graph_DB-Neo4j-028090?style=flat-square&logo=neo4j&logoColor=white&labelColor=021f2e)](https://neo4j.com)
[![Groq](https://img.shields.io/badge/AI-Groq_LLaMA_3.1-05668D?style=flat-square&labelColor=021f2e)](https://groq.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-F0F3BD?style=flat-square&logo=typescript&logoColor=white&labelColor=021f2e)](https://www.typescriptlang.org)

<br/>

**Works on Claude · ChatGPT · Gemini**

<br/>

</div>

---

## The Problem Nobody Talks About

You're deep into a complex project. You've had 12 conversations with Claude about your architecture, your auth flow, your database schema, the bug you cracked at 2am. Real decisions. Real progress.

Then you open a new chat.

**And it's all gone.**

You spend the next 20 minutes re-explaining your stack, what you decided last session, what you already tried. Every session starts from zero. You're not talking to an AI with memory — you're talking to a stranger who happens to be very smart.

> *"I just spent 15 minutes explaining my entire project to Claude again. There has to be a better way."*
> — Every developer using AI assistants daily

**There is now.**

---

## What SYNQ Does

SYNQ is a **Chrome extension + local backend** that gives your AI assistant a memory it was never designed to have.

It captures the knowledge from your AI conversations, distills it into a semantic knowledge graph, and injects it back as a structured AI-readable briefing when you start a new session — in seconds, not minutes.

**Before SYNQ:**
```
New chat → explain stack → explain decisions → explain current status → 20 min later → finally working
```

**After SYNQ:**
```
New chat → inject context → AI already knows everything → start working immediately
```

---

## How It Works

```
╔══════════════════════════════════════════════════════════╗
║                   THE SYNQ PIPELINE                      ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  1. CAPTURE                                              ║
║     Finish a chat → click Capture → name your session    ║
║     SYNQ scrapes all AI responses from the page          ║
║                         │                                ║
║                         ▼                                ║
║  2. PRIVACY SCRUB                                        ║
║     API keys, JWTs, passwords, emails → [REDACTED]       ║
║     Your secrets never leave your machine                ║
║                         │                                ║
║                         ▼                                ║
║  3. AI COMPRESSION  (Groq LLaMA 3.1 — free)              ║
║     Raw chat → compressed technical facts only           ║
║     "JWT is stateless" → kept                            ║
║     "Okay great! Let's continue" → discarded             ║
║                         │                                ║
║                         ▼                                ║
║  4. TRIPLE EXTRACTION                                    ║
║     Facts become semantic triples stored in Neo4j:       ║
║     (SplitSmart) -[USES]-> (JWT)                         ║
║     (JWT) -[HAS_PROPERTY]-> (Stateless)                  ║
║     (MongoDB) -[STORES]-> (UserSessions)                 ║
║                         │                                ║
║                         ▼                                ║
║  5. INJECT                                               ║
║     New chat → click Inject Context Now                  ║
║     SYNQ generates a structured AI-readable summary      ║
║     and pastes it into the chat input automatically      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

## Features

| Feature | Description |
|---|---|
| **One-click capture** | Finish a chat, name it, save everything — 5 seconds |
| **Knowledge graph** | Technical facts stored as semantic triples in Neo4j |
| **Smart injection** | AI-generated structured project summary, not raw text dumps |
| **Live graph visualization** | D3.js force graph of your entire knowledge network |
| **Session manager** | Browse, load, and delete past sessions from the dashboard |
| **Privacy scrubbing** | API keys, JWTs, emails auto-redacted before any processing |
| **Multi-platform** | Claude, ChatGPT, Gemini — one extension, all three |
| **Fully local** | Your data stays on your machine |
| **Free to run** | Groq free tier — no credit card, no hidden costs |

---

## Architecture

```
                     ┌──────────────────────┐
                     │    Your AI Chat Tab  │
                     │  claude.ai /         │
                     │  chatgpt.com /       │
                     │  gemini.google.com   │
                     └──────────┬───────────┘
                                │
               ┌────────────────▼────────────────┐
               │         Chrome Extension        │
               │   content.ts  — DOM scraper     │
               │   background.ts — API bridge    │
               │   popup.js — Session manager UI │
               └────────────────┬────────────────┘
                                │ HTTP
               ┌────────────────▼────────────────┐
               │          Node.js Backend        │
               │                                 │
               │   Privacy Layer (PII scrubber)  │
               │           │                     │
               │   Groq LLaMA 3.1 (free)         │
               │   1. Summarize raw chat         │
               │   2. Extract semantic triples   │
               │   3. Generate project summary   │
               │           │                     │
               │     ┌─────┴──────┐              │
               │     ▼            ▼              │
               │  Neo4j        MongoDB           │
               │  (Graph)      (Sessions)        │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │      React + D3.js Dashboard    │
               │  Graph viewer · Session manager │
               └─────────────────────────────────┘
```

---

## Tech Stack

**Extension:** TypeScript · Chrome Manifest V3 · Shadow DOM

**Backend:** Node.js · Express · TypeScript · ts-node

**AI:** Groq API · LLaMA 3.1 8B Instant (free tier, 14,400 req/day)

**Databases:** Neo4j 5.18 (knowledge graph) · MongoDB 7.0 (sessions)

**Dashboard:** React 19 · Vite · D3.js v7

**Infrastructure:** Docker Compose

---

## Getting Started

### Prerequisites

| Requirement | Why | Get it |
|---|---|---|
| Node.js 18+ | Backend runtime | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Runs Neo4j + MongoDB | [docker.com](https://www.docker.com/products/docker-desktop) |
| Google Chrome | Extension host | [google.com/chrome](https://www.google.com/chrome) |
| Groq API key | AI extraction | [console.groq.com](https://console.groq.com) — free, no credit card |

---

### Step 1 — Clone

```bash
git clone https://github.com/yourusername/synq.git
cd synq
```

---

### Step 2 — Start the databases

```bash
docker-compose up -d
```

Expected output:
```
✔ Container synq_neo4j   Started
✔ Container synq_mongo   Started
```

Verify:
```bash
docker ps
# Both containers should show status "Up"
```

---

### Step 3 — Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your Groq key:

```env
PORT=3001

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=synqpassword123

# MongoDB
MONGO_URI=mongodb://synq:synqpassword123@localhost:27017/synqdb?authSource=admin

# Groq — free at console.groq.com
GROQ_API_KEY=gsk_your_key_here
```

---

### Step 4 — Start the backend

```bash
npm install
npm run dev
```

Expected output:
```
✅ MongoDB connected
✅ Neo4j connected
SYNQ backend running on port 3001
```

---

### Step 5 — Start the dashboard

```bash
cd ../dashboard
npm install
npm run dev
```

Open `http://localhost:5173`

---

### Step 6 — Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `synq/extension` folder

The `⚡SYNQ` badge appears on Claude, ChatGPT, and Gemini.

---

### Every time you use SYNQ

```bash
# Terminal 1
cd synq && docker-compose up -d

# Terminal 2
cd synq/backend && npm run dev

# Terminal 3
cd synq/dashboard && npm run dev
```

---

## Using SYNQ

### Capturing a session

1. Have a full conversation with Claude, ChatGPT, or Gemini
2. Click the **SYNQ** extension icon in the Chrome toolbar
3. Type a project name (e.g. `SplitSmart`)
4. Click **Extract Context**

You'll see: `✅ Captured N facts from this chat`

---

### Injecting context into a new chat

**From the extension:**
1. Open a new chat on any supported platform
2. Click the SYNQ icon → **Inject Context Now**
3. Context appears in the chat input — send it

**From the dashboard (for older sessions):**
1. Open `http://localhost:5173`
2. Select a session from the left sidebar
3. Click **Load into Extension**
4. Go to your AI chat → **Inject Context Now**

---

### What gets injected

SYNQ generates a structured, compressed summary — not a wall of text:

```
[SYNQ CONTEXT — Previous Session Knowledge]
You have worked on this project before. Here is what was discussed:

## Project: SplitSmart
**Stack:** MERN — MongoDB, Express, React, Node.js
**Auth:** JWT with refresh token rotation, bcrypt for passwords
**Key Decisions:** Mongoose for ODM, React Query for server state
**Features in progress:** Expense splitting algorithm, group management
**Known issues:** JWT refresh flow not yet implemented on frontend

Use this as your working memory. Do not re-explain things already established.
[END SYNQ CONTEXT]
```

The AI immediately understands your project without you saying a word.

---

## Project Structure

```
synq/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── routes/
│   │   │   ├── context.ts        # Capture, retrieve, session routes
│   │   │   └── graph.ts          # Graph query routes
│   │   ├── services/
│   │   │   ├── extractor.ts      # Groq triple extraction pipeline
│   │   │   ├── neo4j.ts          # Graph database service
│   │   │   └── mongo.ts          # Session metadata service
│   │   └── utils/
│   │       └── privacy.ts        # PII scrubbing
│   ├── .env.example
│   └── package.json
│
├── extension/
│   ├── src/
│   │   ├── content.ts            # DOM scraper + context injector
│   │   └── background.ts         # Service worker + API bridge
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   ├── dist/                     # Compiled output (auto-generated)
│   ├── icons/icon48.png
│   └── manifest.json
│
├── dashboard/
│   ├── src/
│   │   ├── App.tsx               # Main app + session management
│   │   ├── components/
│   │   │   └── GraphView.tsx     # D3.js force graph
│   │   └── api/
│   │       └── synq.ts           # Backend API calls
│   └── package.json
│
└── docker-compose.yml
```

---

## Roadmap

**v1.0 — Current**
- Chrome extension (Claude, ChatGPT, Gemini)
- Neo4j knowledge graph with semantic triples
- Two-stage Groq pipeline (summarize → extract → generate)
- Structured context injection
- D3.js graph dashboard with session manager
- PII scrubbing

**v1.1 — Next**
- Pinecone vector search for semantic context retrieval
- Multi-session merge (combine knowledge across projects)
- Export knowledge graph as JSON / CSV
- Keyboard shortcut for quick injection

**v2.0 — Future**
- Optional cloud sync (privacy-preserving, self-hostable)
- MCP (Model Context Protocol) server — native Claude integration
- Automatic background capture (opt-in)
- Team knowledge graphs (shared sessions)

---

## Contributing

Contributions are very welcome. Whether it's a typo fix or a major feature — all help is appreciated.

**Ways to contribute:**
- Report bugs — open an Issue with steps to reproduce
- Suggest features — open an Issue tagged `enhancement`
- Fix bugs — check Issues tagged `good first issue`
- Add platform support — new AI platform CSS selectors
- Improve documentation

**How to contribute code:**

```bash
# 1. Fork the repo on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/synq.git
cd synq

# 3. Create a feature branch
git checkout -b feature/what-you-are-building

# 4. Make changes and commit
git add .
git commit -m "feat: describe what you did"

# 5. Push and open a Pull Request
git push origin feature/what-you-are-building
```

**Commit format:**
```
feat: add firefox extension support
fix: correct Claude DOM selector after UI update
docs: improve Windows setup instructions
refactor: simplify triple deduplication logic
```

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Chrome only | Firefox support planned for v1.1 |
| Local setup required | Cloud version on roadmap |
| Manual capture | Auto-capture planned as opt-in feature |
| Platform selectors may break | Open an issue — usually fixed same day |
| Groq free tier rate limits | Chunking handles most cases; upgrade if needed |

---

## Privacy

- **Your data stays local.** All knowledge is stored in Docker containers on your machine. Nothing syncs to any external server.
- **PII is auto-scrubbed.** Before any text reaches Groq, SYNQ strips API keys, JWT tokens, `.env` secrets, and email addresses.
- **You control capture.** SYNQ only captures when you press the button. No background monitoring.
- **Full deletion.** Every session can be permanently deleted from the dashboard — removed from both MongoDB and Neo4j.
- **One external call.** Text you explicitly capture is sent to Groq for AI processing. That's the only external service involved.

---

## FAQ

**Do I need to pay for anything?**
No. Groq free tier gives 14,400 requests/day. Neo4j and MongoDB run locally in Docker. Everything else is open source.

**Will this work on other AI platforms?**
Currently Claude, ChatGPT, and Gemini. Adding a new platform is one CSS selector in `content.ts` — contributions welcome.

**What if Claude or ChatGPT updates their UI and it breaks?**
Open an issue. We track platform selector changes and fix quickly.

**Can I use this for multiple projects?**
Yes. Each capture is a named session. Load any session into the extension at any time from the dashboard.

**How much context gets injected?**
A compressed structured summary — typically 100–200 words. Concise by design to minimize tokens while maximizing usefulness.

---

## License

MIT — see [LICENSE](LICENSE) for full text.

Use it for anything. Personal projects, commercial products, forks, modifications. Just keep the license file.

---

<div align="center">

<br/>

**Built by a developer, for developers.**

*Every ⭐ tells me someone else felt this pain and found SYNQ useful.*
*It takes two seconds and genuinely helps.*

**[⭐ Star SYNQ on GitHub](https://github.com/yourusername/synq)**

<br/>

*Made with · TypeScript · Neo4j · and genuine frustration at AI memory loss*

</div>