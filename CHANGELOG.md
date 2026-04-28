# SYNQ — Changelog

---

## v1.3 — UI/UX Overhaul & Open Source Readiness

### Dashboard Aesthetics & Typography
- **Knowledge Graph Visual Hierarchy:** Completely redesigned the `GraphView.tsx` node radius scaling. Main topic hubs are now rendered significantly larger (up to 60px) while sub-topics are rendered much smaller (down to 8px) to create a highly readable, dense, clustered visualization.
- **Smart Labels:** Node abbreviations are now dynamically hidden on smaller nodes to prevent text overflow and visual clutter.
- **Chat Viewer Colors:** Updated user and assistant message bubble colors to utilize vivid, premium indigo and cyan tones that better complement the dark theme.
- **Sidebar Redesign:** Center-aligned the sidebar headers and integrated the *Outfit* Google Font for a professional, typographic "SYNQ" logo.

### Open Source Standardization
- Added `CODE_OF_CONDUCT.md` to foster a welcoming contributor environment.
- Added `SECURITY.md` for standardized vulnerability reporting.
- Added `.github/ISSUE_TEMPLATE` (Bug Reports & Feature Requests) and `PULL_REQUEST_TEMPLATE.md` to streamline community contributions.
- Completely rewrote `README.md` to a professional standard, fully documenting the v1.2/v1.3 architecture including Auto-Connect and ChromaDB.

### Code Quality
- Resolved React Hook linting errors (`set-state-in-effect`, `exhaustive-deps`, and refs accessed during render) across `App.tsx` and `GraphView.tsx`.
- Verified 0 dead code or unused files across the extension, backend, and dashboard.

---

## v1.2 — Sliding Window RAG + Auto-Connect + Graph Overhaul

### RAG Pipeline — 100% Data Fidelity

| Before (v1.0-1.1) | After (v1.2) |
|---|---|
| Groq LLM splits chat into named topics | Pure sliding window: 300-word windows, 80-word overlap |
| Personal facts filtered as "filler" | Every word preserved in at least one chunk |
| Content < 50 chars rejected | No minimum |
| ~1-3s API call per save | Instant (0ms, no network) |
| `TopicChunk` with `topicName` | `WindowChunk` with `chunkIndex` |
| Collection: `synq_topics` | Collection: `synq_chunks_v2` |
| Similarity threshold: 0.30 (L2+exp) | Threshold: 0.30 (cosine, `1-distance`) |
| topN default: 1 | topN default: 3 |

**Files changed:**
- `backend/src/services/chunker.ts` — Full rewrite (pure sliding window function)
- `backend/src/services/chroma.ts` — `TopicChunk` → `WindowChunk`, metadata uses `chunkIndex`
- `backend/src/routes/chat.ts` — Uses `slidingWindowChunks` instead of `splitIntoTopics`
- `backend/src/routes/rag.ts` — Context header shows chunk position, topN default 3

### Auto-Connect + Pause Toggle

| Before | After |
|---|---|
| Manual Connect/Disconnect buttons (broken) | Auto-connect on init() if session active |
| `connectMode` + `connectSessionId` state | `isPaused` state |
| `GET/SET_CONNECT_STATE` messages | `GET/SET_PAUSE_STATE` + `PAUSE_SYNQ`/`RESUME_SYNQ` |
| Badge: ⚡ or 🔗 | Badge: ⚡ (idle) / 🔗 (active) / ⏸ (paused) |

**Files changed:**
- `extension/src/content.ts` — Auto-attaches interceptor on init, removed connectMode
- `extension/src/background.ts` — Pause state replaces connect state
- `extension/popup/popup.ts` — Pause toggle UI
- `extension/popup/popup.html` — New button + status badge

### Knowledge Graph — Broader Extraction

Entity types expanded from 12 to 22:
- Added: `Person | Pet | Goal | Problem | Preference | Habit | Tool | Pattern | Location | Organization`

Relation types expanded from ~6 to 20+:
- Added: `OWNS | NAMED | PREFERS | WANTS | KNOWS | HAS | LIVES_WITH | IS_BUILDING | SOLVED_WITH | STRUGGLING_WITH | DECIDED_TO | INTERESTED_IN | WORKS_AT | CREATED_BY | RUNS_ON`

**File changed:** `backend/src/services/extractor.ts`

### Graph Visualization Redesign

| Before | After |
|---|---|
| Fixed node size (28px) | Sized by connection degree (20-48px) |
| Straight line edges | Curved quadratic bezier paths |
| Edge labels always visible | Hidden, shown on hover |
| No tooltip | Hover tooltip (name, type, connections) |
| No legend | Auto-populated type legend (top-right) |
| Labels truncated at 14 chars | Full labels, dynamically sized |
| No zoom controls | +/−/reset buttons (bottom-left) |
| Single glow filter | Per-type colored glow filters |
| 12 colors | 22+ colors |

**File changed:** `dashboard/src/components/GraphView.tsx`

### Chat Tab — Raw Conversation Viewer

Replaced topic-list sidebar with styled conversation view:
- User messages right-aligned with indigo border
- Assistant messages left-aligned with cyan border
- Parses `[User]:` / `[Assistant]:` markers from rawText
- Header shows turn count, message count, save date

**File changed:** `dashboard/src/components/ChatViewer.tsx`

### Bug Fix: start.bat Closes Immediately

**Root cause:** `npx tsc` and `npm install` were called without the `call` keyword. In Windows batch files, running an external program without `call` transfers control permanently — the batch script never returns to the next line.

**Fix:** Added `call` before every `npx` and `npm` invocation. Split tsc builds into separate error-checked blocks.

**File changed:** `start.bat`

---

## v1.1 — Security & Reliability Audit

A full audit was performed on the v1.0 codebase.

**Security**
- Groq API key removed from `.env`
- Docker Compose passwords extracted to environment variables
- CORS locked down from wildcard to explicit allowed origins
- Rate limiting added: 200 req/min global, 10 req/min on `/api/chat/save`
- Request body limit reduced from 50MB to 10MB

**Code Quality**
- All `console.log/error` calls replaced with the `logger` utility across all services
- 3 unused dependencies removed — 62 packages lighter
- ChromaDB image pinned to `0.6.3`
- `updatedAt` field added to `FullChat` Mongoose schema

**Performance**
- Embeddings now generated in parallel (`Promise.all`)
- Project summary cached in MongoDB — Groq no longer called on every context read

**Robustness**
- Validated `sessionId` as a valid MongoDB ObjectId
- `execCommand` replaced with Selection API + `InputEvent`
- Dashboard polling no longer resets active session during user interaction (`isLoadingSessionRef`)
- Dashboard shows a user-visible error banner when the backend is unreachable

---

## v1.0 — Initial Release

- Core Extension (Claude, ChatGPT, Gemini selectors)
- Content scraping and local extraction pipeline
- MongoDB session storage
- Neo4j Knowledge graph initialization