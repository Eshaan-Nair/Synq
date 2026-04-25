<div align="center">

<h1>SYNQ</h1>
<h3>The Context Sovereignty Engine</h3>
<p><em>Your AI forgets everything. SYNQ remembers.</em></p>

<br/>

[![Stars](https://img.shields.io/github/stars/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=021f2e&color=02C39A)](https://github.com/Eshaan-Nair/Synq/stargazers)
[![Forks](https://img.shields.io/github/forks/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=021f2e&color=028090)](https://github.com/Eshaan-Nair/Synq/forks)
[![Issues](https://img.shields.io/github/issues/Eshaan-Nair/Synq?style=for-the-badge&logo=github&labelColor=021f2e&color=05668D)](https://github.com/Eshaan-Nair/Synq/issues)
[![Last Commit](https://img.shields.io/github/last-commit/Eshaan-Nair/Synq?style=for-the-badge&labelColor=021f2e&color=02C39A)](https://github.com/Eshaan-Nair/Synq/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-F0F3BD?style=for-the-badge&labelColor=021f2e)](LICENSE)

<br/>

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-02C39A?style=flat-square&logo=googlechrome&logoColor=white&labelColor=021f2e)](https://github.com/Eshaan-Nair/Synq)
[![Neo4j](https://img.shields.io/badge/Graph_DB-Neo4j-028090?style=flat-square&logo=neo4j&logoColor=white&labelColor=021f2e)](https://neo4j.com)
[![Groq](https://img.shields.io/badge/AI-Groq_LLaMA_3.1-05668D?style=flat-square&labelColor=021f2e)](https://groq.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-F0F3BD?style=flat-square&logo=typescript&logoColor=white&labelColor=021f2e)](https://www.typescriptlang.org)

<br/>

**Works on Claude · ChatGPT · Gemini**

<br/>

<!-- Replace this line with your demo GIF: ![SYNQ demo](demo.gif) -->

</div>

---

## Quick start

```bash
git clone https://github.com/Eshaan-Nair/Synq.git
cd Synq

# macOS / Linux
cp backend/.env.example backend/.env   # add your GROQ_API_KEY
chmod +x start.sh && ./start.sh

# Windows
copy backend\.env.example backend\.env  # add your GROQ_API_KEY
start.bat
```

Then load the Chrome extension — see [Step 6](#step-6--load-the-chrome-extension) below.

That's it. Everything else is optional reading.

---

## The problem nobody talks about

You're deep into a complex project. You've had 12 conversations with Claude about your architecture, your auth flow, your database schema, the bug you cracked at 2am. Real decisions. Real progress.

Then you open a new chat.

**And it's all gone.**

You spend the next 20 minutes re-explaining your stack, what you decided last session, what you already tried. Every session starts from zero. You're not talking to an AI with memory — you're talking to a stranger who happens to be very smart.

I built SYNQ because I was spending 15 minutes re-explaining the same project to Claude every single session. There had to be a better way.

**There is now.**

---

## What SYNQ does

SYNQ is a **Chrome extension + local backend** that gives your AI assistant persistent memory it was never designed to have.

It captures knowledge from your AI conversations, distills it into a semantic knowledge graph, and injects it back as a structured briefing when you start a new session — in seconds, not minutes.

**Before SYNQ:**
```
New chat → explain stack → explain decisions → explain status → 20 min → finally working
```

**After SYNQ:**
```
New chat → inject context → AI already knows everything → start working immediately
```

**What the AI sees when you inject:**

```
[SYNQ CONTEXT — Previous Session Knowledge]

## Project: SplitSmart
**Stack:** MERN — MongoDB, Express, React, Node.js
**Auth:** JWT with refresh token rotation, bcrypt for passwords
**Key decisions:** Mongoose for ODM, React Query for server state
**Features in progress:** Expense splitting algorithm, group management
**Known issues:** JWT refresh flow not yet implemented on frontend

Use this as your working memory. Do not re-explain things already established.
[END SYNQ CONTEXT]
```

The AI immediately responds as if it was already in the conversation — no re-explanation needed.

---

## Features

| Feature | Description |
|:---|:---|
| **Fully local** | All data stored on your machine — nothing goes to any external server |
| **Privacy scrubbing** | API keys, JWTs, emails, connection strings auto-redacted before any processing |
| **One-click capture** | Finish a chat, name it, save everything — 5 seconds |
| **Knowledge graph** | Technical facts stored as semantic triples in Neo4j |
| **Smart injection** | AI-generated structured project summary, not raw text dumps |
| **Live graph visualization** | D3.js force graph of your entire knowledge network |
| **Session manager** | Browse, load, and delete past sessions from the dashboard |
| **Multi-platform** | Claude, ChatGPT, Gemini — one extension, all three |
| **Free to run** | Groq free tier — no credit card, no hidden costs |

---

## How it works

```
  1. CAPTURE
     Finish a chat → click Capture → name your session
     SYNQ scrapes all AI responses from the page
                      │
                      ▼
  2. PRIVACY SCRUB
     API keys, JWTs, passwords, connection strings → [REDACTED]
     Your secrets never leave your machine
                      │
                      ▼
  3. AI COMPRESSION  (Groq LLaMA 3.1 — free tier)
     Raw chat → compressed technical facts only
     "JWT is stateless" → kept
     "Okay great! Let's continue" → discarded
                      │
                      ▼
  4. TRIPLE EXTRACTION
     Facts become semantic triples stored in Neo4j:
     (SplitSmart) -[USES]-> (JWT)
     (JWT) -[HAS_PROPERTY]-> (Stateless)
     (MongoDB) -[STORES]-> (UserSessions)
                      │
                      ▼
  5. INJECT
     New chat → click Inject Context Now
     SYNQ generates a structured AI-readable summary
     and pastes it into the chat input automatically
```

---

## Tech stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| Extension | TypeScript · Chrome Manifest V3 · Shadow DOM | DOM scraping, context injection |
| Backend | Node.js · Express · TypeScript | API, orchestration |
| AI | Groq · LLaMA 3.1 8B Instant | Triple extraction (free tier) |
| Graph DB | Neo4j 5.18 | Semantic knowledge graph |
| Session DB | MongoDB 7.0 | Session metadata |
| Dashboard | React 19 · Vite · D3.js v7 | Graph visualisation |
| Infrastructure | Docker Compose | One-command database setup |

---

## Getting started

### Prerequisites

| Requirement | Why | Get it |
|:---|:---|:---|
| Node.js 18+ | Backend runtime | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Runs Neo4j + MongoDB | [docker.com](https://www.docker.com/products/docker-desktop) — requires WSL2 on Windows ([enable WSL2](https://docs.microsoft.com/en-us/windows/wsl/install)) |
| Google Chrome | Extension host | [google.com/chrome](https://www.google.com/chrome) |
| Groq API key | AI extraction | [console.groq.com](https://console.groq.com) — free, no credit card |

---

### Step 1 — Clone

```bash
git clone https://github.com/Eshaan-Nair/Synq.git
cd Synq
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
# macOS / Linux
cp backend/.env.example backend/.env

# Windows
copy backend\.env.example backend\.env
```

A `.env.example` file is included in the repo with all keys pre-filled except `GROQ_API_KEY`.

Edit `backend/.env` and add your Groq key:

```env
PORT=3001

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=synqpassword123

# MongoDB
MONGO_URI=mongodb://synq:synqpassword123@localhost:27017/synqdb?authSource=admin

# Groq — free at console.groq.com (no credit card required)
GROQ_API_KEY=gsk_your_key_here
```

---

### Step 4 — Start the backend

```bash
cd backend
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
4. Select the `Synq/extension` folder

The `⚡ SYNQ` badge appears at the bottom-right corner of Claude, ChatGPT, and Gemini.

---

### Every time you use SYNQ

Instead of running 3 terminals manually, use the included start script:

```bash
# macOS / Linux
./start.sh

# Windows
start.bat
```

This boots the databases, backend, and dashboard in one command. Press `Ctrl+C` to stop everything.

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

## Project structure

```
Synq/
├── start.sh                          # One-command start (macOS/Linux)
├── start.bat                         # One-command start (Windows)
├── docker-compose.yml                # Neo4j + MongoDB
│
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Server entry point
│   │   ├── routes/
│   │   │   ├── context.ts            # Capture, retrieve, session routes
│   │   │   └── graph.ts              # Graph query routes
│   │   ├── services/
│   │   │   ├── extractor.ts          # Groq triple extraction pipeline
│   │   │   ├── neo4j.ts              # Graph database service
│   │   │   └── mongo.ts              # Session + active session storage
│   │   └── utils/
│   │       └── privacy.ts            # PII scrubbing
│   ├── .env.example                  # Copy to .env and fill in GROQ_API_KEY
│   └── package.json
│
├── extension/
│   ├── src/
│   │   ├── content.ts                # DOM scraper + context injector
│   │   └── background.ts             # Service worker + API bridge
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   ├── dist/                         # Compiled output (auto-generated)
│   ├── icons/icon48.png
│   └── manifest.json
│
└── dashboard/
    ├── src/
    │   ├── App.tsx                   # Main app + session management
    │   ├── components/
    │   │   └── GraphView.tsx         # D3.js force graph
    │   └── api/
    │       └── synq.ts               # Backend API calls
    └── package.json
```

---

## Troubleshooting

**Captured 0 facts / "No AI responses found"**

The platform's UI has probably updated its CSS classes. SYNQ uses DOM selectors to find AI responses — these can change without notice.
1. Check [open issues](https://github.com/Eshaan-Nair/Synq/issues) — it may already be fixed
2. Open a new issue with your browser version and which platform broke
3. We track selector changes and fix quickly

**Backend fails to start**

Make sure Docker is running first:
```bash
docker ps   # should show synq_neo4j and synq_mongo as "Up"
```
If containers aren't running: `docker-compose up -d`

**"Backend unreachable" in the popup**

The backend must be running on port 3001 before the extension can communicate.
Run `cd backend && npm run dev` and check for errors in the terminal output.

**Injection doesn't appear in the chat input**

Click directly inside the chat input box first, then click "Inject Context Now" in the popup. Some platforms require the input to be focused before SYNQ can write to it.

**Docker on Windows — containers fail to start**

Enable WSL2: [Microsoft WSL2 install guide](https://docs.microsoft.com/en-us/windows/wsl/install). Then restart Docker Desktop.

---

## Roadmap

**v1.0 — Current**
- Chrome extension (Claude, ChatGPT, Gemini)
- Neo4j knowledge graph with semantic triples
- Two-stage Groq pipeline (summarize → extract → generate)
- Structured context injection
- D3.js graph dashboard with session manager
- PII scrubbing
- Persistent active session (survives server restarts)

**v1.1 — Next**
- Local vector search for semantic context retrieval (no cloud dependency)
- Multi-session merge (combine knowledge across projects)
- Export knowledge graph as JSON / CSV
- Keyboard shortcut for quick injection
- Firefox extension support

**v2.0 — Future**
- MCP (Model Context Protocol) server — native Claude Code integration
- Automatic background capture (opt-in)
- Optional cloud sync (privacy-preserving, self-hostable)
- Team knowledge graphs (shared sessions)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started, including a step-by-step guide to adding support for new AI platforms.

---

## Known limitations

| Limitation | Notes |
|:---|:---|
| Chrome only | Firefox support planned for v1.1 |
| Local setup required | Cloud version on roadmap |
| Manual capture | Auto-capture planned as opt-in feature |
| **Platform selectors may break** | If capture returns 0 facts, the platform's UI has likely updated. Open an issue immediately — usually fixed same day |
| Groq free tier rate limits | Check [console.groq.com](https://console.groq.com) for current limits. Chunking handles most normal usage |

---

## Privacy

- **Your data stays local.** All knowledge is stored in Docker containers on your machine. Nothing syncs to any external server.
- **PII is auto-scrubbed.** Before any text reaches Groq, SYNQ strips API keys, JWT tokens, `.env` secrets, connection strings, and email addresses.
- **You control capture.** SYNQ only captures when you press the button. No background monitoring.
- **Full deletion.** Every session can be permanently deleted from the dashboard — removed from both MongoDB and Neo4j simultaneously.
- **One external call.** Text you explicitly capture is sent to Groq for AI processing. That is the only external service involved.

---

## FAQ

**Do I need to pay for anything?**

No. Groq's free tier has generous daily limits — enough for normal development usage. Neo4j and MongoDB run locally in Docker. Everything else is open source. Check [console.groq.com](https://console.groq.com) for current rate limits.

**Will this work on other AI platforms?**

Currently Claude, ChatGPT, and Gemini. Adding a new platform requires updating 4 places in `content.ts` (platform detection + 2 selectors) and 2 fields in `manifest.json`. See [CONTRIBUTING.md](CONTRIBUTING.md) for a step-by-step guide — contributions welcome.

**What if Claude or ChatGPT updates their UI and it breaks?**

Open an issue. We track platform selector changes and fix quickly. SYNQ uses multiple fallback selectors per platform to reduce breakage frequency.

**Can I use this for multiple projects?**

Yes. Each capture is a named session. Load any session into the extension at any time from the dashboard.

**How much context gets injected?**

A compressed structured summary — typically 100–200 words. Concise by design to minimize tokens while maximising usefulness.

**Does restarting the backend lose my active session?**

No. As of v1.0, the active session is persisted in MongoDB and survives server restarts.

---

## License

MIT — see [LICENSE](LICENSE) for full text.

Use it for anything. Personal projects, commercial products, forks, modifications. Just keep the license file.

---

<div align="center">

<br/>

**Built by a developer, for developers.**

If SYNQ saves you time, a star helps others find it.

**[⭐ Star SYNQ on GitHub](https://github.com/Eshaan-Nair/Synq)**

<br/>

*Made with TypeScript, Neo4j, and genuine frustration at AI memory loss*

</div>
