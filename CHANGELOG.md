# SYNQ — Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.3.0] — 2026-04-27 — UI/UX Overhaul & Open Source Readiness

### Dashboard — Graph Visualization

- **Degree-scaled nodes** — hub nodes now render up to 60px radius; leaf nodes as small as 8px, creating a visually hierarchical, readable force graph
- **Smart label hiding** — labels are suppressed on small nodes to prevent text overflow and visual clutter
- **Curved bezier edges** — straight lines replaced with quadratic bezier paths; edge labels hidden until hover
- **Hover tooltip** — shows node name, type, and connection count on hover
- **Per-type glow filters** — each entity type has a distinct colored glow, 22 colors total
- **Zoom controls** — +/−/reset buttons in the bottom-left corner
- **3D radial gradient fills** — depth effect on all nodes

### Dashboard — Chat Viewer

- **Color-coded conversation view** — user messages right-aligned (indigo), assistant messages left-aligned (cyan)
- **Turn parser** — `[User]:` / `[Assistant]:` markers parsed from raw text into styled bubbles
- **Header stats** — turn count, message count, save date shown above the conversation

### Dashboard — App Shell

- **Sidebar redesign** — center-aligned header with Outfit typeface for the SYNQ wordmark
- **Skeleton loaders** — animated placeholders during session data loading
- **Error banner** — user-visible fixed banner when the backend is unreachable, dismissible
- **React Hook fixes** — resolved `set-state-in-effect`, `exhaustive-deps`, and ref-during-render lint errors. ESLint now reports 0 errors.

### Open Source Readiness

- Added `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- Added `SECURITY.md` with vulnerability reporting policy and response SLA
- Added `.github/ISSUE_TEMPLATE/` (bug report + feature request templates)
- Added `PULL_REQUEST_TEMPLATE.md`
- Rewrote `README.md` to document the v1.2/v1.3 architecture, Auto-Connect, ChromaDB, and the full pipeline
- Added `CHANGELOG.md`, `ARCHITECTURE.md`, `RAG_PIPELINE.md`, `PLATFORM_SELECTORS.md`, `SELF_HOSTING.md`, `CONTRIBUTING.md`

---

## [1.2.0] — 2026-04-26 — Sliding Window RAG + Auto-Connect + Graph Overhaul

### RAG Pipeline — Zero Data Loss

The Groq-based topic splitter was replaced entirely with a pure sliding window chunker.

| | Groq Topic Splitter (v1.0–1.1) | Sliding Window (v1.2+) |
|---|---|---|
| Personal facts | Deleted as "filler" | Preserved verbatim |
| Short messages | Rejected | Always included |
| API call on save | Yes (1–3s) | None (0ms) |
| Information loss | Significant | Zero |
| topN default | 1 | 3 |

**Files changed:**
- `backend/src/services/chunker.ts` — full rewrite (pure sliding window function)
- `backend/src/services/chroma.ts` — `TopicChunk` → `WindowChunk`; metadata uses `chunkIndex` instead of `topicName`; similarity now computed as `1 - cosine_distance` (was incorrectly using `exp(-L2_distance)`)
- `backend/src/routes/chat.ts` — uses `slidingWindowChunks` instead of `splitIntoTopics`
- `backend/src/routes/rag.ts` — context header shows chunk position + relevance %, `topN` default raised to 3

### Auto-Connect + Pause Toggle

The manual Connect/Disconnect button flow was replaced with automatic connection on init and a simple Pause toggle.

| | v1.1 | v1.2 |
|---|---|---|
| Connection model | Manual button (broken) | Auto-attach on init() |
| State | `connectMode` + `connectSessionId` | `isPaused` boolean |
| Messages | `GET/SET_CONNECT_STATE` | `GET/SET_PAUSE_STATE` + `PAUSE_SYNQ`/`RESUME_SYNQ` |
| Badge states | ⚡ or 🔗 | ⚡ idle / 🟢 active / ⏸ paused |

**Files changed:**
- `extension/src/content.ts` — auto-attaches interceptor on init(); removed all connectMode logic
- `extension/src/background.ts` — pause state replaces connect state
- `extension/popup/popup.ts` — pause toggle UI, correct session boot sequence
- `extension/popup/popup.html` — updated button text and status badge

### Knowledge Graph — Broader Extraction

Entity types expanded from 12 → 22 (added: `Person · Pet · Goal · Problem · Preference · Habit · Tool · Pattern · Location · Organization`)

Relation types expanded from ~6 → 20+ (added: `OWNS · NAMED · PREFERS · WANTS · KNOWS · HAS · LIVES_WITH · IS_BUILDING · SOLVED_WITH · STRUGGLING_WITH · DECIDED_TO · INTERESTED_IN · WORKS_AT · CREATED_BY · RUNS_ON`)

Strict classification rules added to prevent AI model names (Gemini, Claude, GPT) from being misclassified as Pet or Person.

**File changed:** `backend/src/services/extractor.ts`

### Bug Fixes

- **`start.bat` closes immediately** — root cause: `npx` and `npm` called without `call` keyword in batch script, permanently transferring control and never returning. Fixed by adding `call` before every `npx`/`npm` invocation and splitting tsc builds into separate error-checked blocks.
- **Infinite loop in chunker** — if `overlapWords >= windowWords`, step would be ≤ 0, causing an infinite loop. Fixed by clamping: `safeOverlap = Math.min(overlapWords, windowWords - 1)`.
- **Session changed broadcast** — content scripts on other tabs were not notified when a new session was created from the popup. Fixed with `broadcastSessionChanged()` in background.ts.

---

## [1.1.0] — 2026-04-25 — Security & Reliability Audit

A full security and code quality audit of the v1.0 codebase.

### Security

- Removed hardcoded Groq API key from `.env`
- Docker Compose credentials extracted to environment variable references with safe defaults
- CORS locked from wildcard (`*`) to explicit allowed origins
- Rate limiting added: 200 req/min global; 10 req/min on `/api/chat/save`
- Request body limit reduced from 50MB to 5MB
- `sessionId` validated as MongoDB ObjectId on all routes
- `platform` validated as enum on session creation and ingest routes
- `execCommand` replaced with Selection API + `InputEvent` (execCommand is deprecated)

### Code Quality

- All `console.log`/`console.error` calls replaced with the `logger` utility across all services
- 3 unused production dependencies removed
- ChromaDB Docker image pinned to `0.6.3` (was unpinned `latest`)
- `updatedAt` field added to `FullChat` Mongoose schema (was missing, causing updates to not persist)
- `returnDocument: 'after'` replaced with `new: true` in Mongoose 9 (deprecated option)

### Performance

- Embeddings now generated in parallel via `Promise.all` (was sequential — 10 chunks = 10 sequential HTTP calls)
- Project summary cached in `Session.summary` — Groq no longer called on every context read, only when `tripleCount` changes

### Robustness

- Neo4j connection now retries with exponential backoff (5 attempts, 2s base delay)
- Neo4j driver exposed via `getDriver()` with null-check — replaces direct module variable access that crashed with an unintelligible error if called before `connectNeo4j()` completed
- Dashboard polling no longer resets active session during user interaction (`isLoadingSessionRef`)
- Dashboard shows user-visible error banner when backend is unreachable

---

## [1.0.0] — 2026-04-24 — Initial Release

- Chrome extension supporting Claude, ChatGPT, and Gemini
- Content scraping of user and AI turns
- Knowledge graph extraction via Groq LLaMA 3.1
- MongoDB session and FullChat storage
- Neo4j semantic graph (12 entity types, ~6 relation types)
- Classic Inject (structured summary pasted into chat input)
- React dashboard with D3.js force graph
- Docker Compose infrastructure (Neo4j, MongoDB)