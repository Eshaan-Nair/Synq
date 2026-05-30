# ArcRift — Changelog

All notable changes documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.5.6] — 2026-05-30 — Installer Patch

### 📦 Setup Script Optimization
- Removed the massive `playwright` dependency from the root `arcrift-setup` package, drastically reducing install times and preventing users from downloading gigabytes of unneeded browser binaries.

---

## [1.5.5] — 2026-05-30 — Analytics & Manual Graph Cleanups

### 📊 Session Analytics & Telemetry
- **Settings Dashboard Tab** — Added a dedicated "Session Analytics" tab that tracks your lifetime token savings and API cost reductions.
- **RAG Telemetry Calculation** — The backend now natively computes token efficiency on every retrieval turn (comparing the raw context length against the injected subset) and persists it directly to the active SQLite session.

### 🕸️ Manual Graph Editing
- **Interactive D3 Context Menus** — Right-clicking any node on the visual Knowledge Graph now spawns a custom, floating ArcRift context menu, completely eliminating the need to use the CLI for graph cleanup.
- **Node Renaming** — You can instantly rename a node across all of its relationships via the new context menu.
- **Edge Manager Modal** — A new sleek overlay allows you to view and selectively sever specific relationship edges connected to a node with a single click.

### 💾 Background Auto-Backup
- **Resilient Memory** — Implemented an automated background chron-job that silently dumps a complete `.sqlite` snapshot to a backup folder once a week, protecting your local knowledge graphs from corruption or unexpected data loss.

---

## [1.5.4] — 2026-05-29 — Session Merging & Context Summarisation

### 🧠 Multi-turn Context Summarisation
- **Hybrid Context Mode** — Added a configuration toggle in the Settings tab to switch between "Raw Chunks" and "Summarized Context" in the RAG pipeline.
- **Token Efficiency** — In Summarized Mode, retrieved chunks and graph facts are intercepted and fed into the local LLM to generate a concise, cohesive prose summary before injection, saving thousands of tokens per turn on large projects.
- **Automatic Fallbacks** — The backend automatically falls back to raw chunk injection if the summarization LLM fails or times out.

### 🔄 Session Merging (Cross-Storage)
- **Unified Projects** — You can now merge older or duplicate sessions directly into your active project via a new Merge Modal in the dashboard sidebar.
- **Data De-duplication** — The system safely merges knowledge graph relationships (dropping duplicates), re-maps vector chunk metadata, and concatenates chat logs into a single historical record.
- **Cross-Ecosystem Support** — Merging logic is natively implemented across both Zero-Docker (SQLite) and Docker (Chroma/Neo4j/Mongo) storage modes.

### ⚙️ Dashboard Settings & Configuration
- **Ollama Model Switcher** — Added a dedicated Settings UI to dynamically change the active Embedding and Extraction models on the fly, without needing to restart the backend or edit `.env`.
- **UI State Hardening** — The dashboard visually disables irrelevant side-panels (Facts/Chat) when navigating to global views like Settings or Global Search to prevent UI deadlocks.

---

## [1.5.3] — 2026-05-23 — The ArcRift Overhaul: Rebrand & Premium "Monolith" UI

### 🔄 Comprehensive Rebrand (Glia → ArcRift)
- **Codebase Sweep** — Executed a 100% complete search-and-replace of all legacy brand references to "ArcRift" across the frontend, backend, and extension.
- **Configuration Updates** — Updated environment variable namespaces (e.g., `ARCRIFT_STORAGE_MODE`), internal message types (`PAUSE_ARCRIFT`), Docker database names (`arcriftdb`), and core API files (`ArcRift.ts`) for case-sensitive Linux CI compliance.
- **Documentation** — Completely rewrote the `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, and all other Markdown files to reflect the new ArcRift identity.

### ✨ Premium Monolith UI
- **Color Palette & Typography** — Implemented a new Deep Slate (`#020617`), Orange (`#F97316`), and Emerald (`#10B981`) palette. Integrated Google Fonts *Outfit* and *Inter* for a high-end developer tool aesthetic.
- **Dynamic Graph Enhancements** — Updated knowledge graph edges to use fluid `quadraticCurveTo` bezier curves and added a persistent top-center indigo radial glow to unify the graph background with the global search view.
- **Extension UI Parity** — Completely rewrote `popup.css` so the Chrome extension perfectly mirrors the dashboard's new dark-glass aesthetic, including the grid background and status pill designs.
- **UI/UX Polish** — Fixed text overflow issues in the System Health component and configured the Job Queue to display a cleaner `-` state when empty.

---

## [1.5.2] — 2026-05-20 — Global Search, Observability & Extension Hardening

### Dashboard

- **Global Search Bar** — Added a debounced global search input to the dashboard header that queries `POST /api/rag/global` across all projects. Results are displayed in a floating dropdown showing a **Facts** section (structured `subject → relation → object` triples from the knowledge graph) and a **Context** section (semantic vector chunks with project attribution).
- **Knowledge Graph Pruning** — Clicking a node in the D3 force graph opens a contextual panel with a **Prune Node** button. Pruned nodes are optimistically removed from the graph without a page reload.
- **System Health Panel** — A live metrics panel pinned to the sidebar footer showing storage mode, session count, total chunk count, job queue status (pending / active / failed / idle pills), and Ollama reachability with model name. Polls every 10 seconds via `GET /api/health`.

### Backend

- **`GET /api/health` endpoint** — New route returning live system metrics: session count, chunk count, job queue summary, active storage mode, and Ollama connectivity check (2 second timeout).
- **`POST /api/graph/prune` endpoint** — REST wrapper exposing the internal `prune_memory` MCP tool to dashboard clients.
- **Global Search: Graph Facts** — `POST /api/rag/global` now returns a `graphFacts` array (knowledge graph triples) alongside vector chunks, mirroring the session-scoped `/api/rag/retrieve` endpoint.
- **Production Log Verbosity** — Downgraded storage-layer logs to `debug` level. Set `LOG_LEVEL=debug` to restore verbose output.

### Extension

- **Selector Failure Warning Badge** — When the extension fails to locate the chat input element on a supported platform due to a stale CSS selector, the popup now shows a yellow warning banner: *"Injection Failed — Could not connect to [Platform]. Selector may be stale."* with a **Report** link (GitHub Issues) and a **Dismiss** button. The status badge turns amber. State persists via `chrome.storage.local` and clears on dismiss.

### CI

- **SQLite-native Pipeline Test** — Added `pipeline-tests-sqlite` job to `.github/workflows/integration-tests.yml`. Runs the full integration test suite with `ARCRIFT_STORAGE_MODE=sqlite`, removing the Docker service container requirement.
- **Storage-Agnostic Integration Tests** — Refactored `pipeline.integration.test.ts` and `jobs.test.ts` to use the Unified Storage Interface (`initStorage()`, `sessionStore`, `vectorStore`). Tests auto-fallback to SQLite mode if `ARCRIFT_STORAGE_MODE` is unset, creating and cleaning up a temporary `.db` file.

### Roadmap

- **v1.5.3 added** — Rebrand & UI restructure milestone (name change due to brand collision, dashboard layout overhaul with command palette and left-rail nav).
- **Former v1.5.3 promoted to v1.5.4** — Multi-turn summarisation, session merging, Ollama model switcher, and export/import.


---

## [1.5.1] — 2026-05-17 — MCP Security & Retrieval Hardening

### Multi-Tenant Isolation (MCP)
- **Zero-Leakage Architecture** — Enforced 100% project isolation in the Model Context Protocol (MCP) server. Sessions are now permanently anchored to project names as unique IDs.
- **Aggressive Cleanup** — Enhanced the stress test suite to purge "Zombie" sessions by both ID and Name, ensuring a clean slate for multi-project audits.
- **Identity Predictability** — Standardized the `createSession` flow to support custom, human-readable IDs for reliable cross-tool lookups.

### RAG & Indexing Reliability
- **Unclogged Sentence Indexing** — Resolved a critical ID mismatch in the background indexing worker that caused sentence-level vectors to fail linkage.
- **Precision Retrieval** — Adjusted sentence length filters to ensure short facts, codes, and snippets are correctly captured by the RAG engine.
- **Virtual Table Resilience** — Migrated vector updates to a delete-then-insert pattern to prevent 'UNIQUE constraint' errors on SQLite virtual tables.

### Stability & Observability
- **WAL Mode Concurrency** — Enabled Write-Ahead Logging (WAL) by default in SQLite mode to support high-concurrency multi-process access.
- **Hyper-Verbose Storage Logs** — Added detailed diagnostic logging to the storage layer to trace session identity and lookup performance.
- **Audit Suite v1.5.1** — Synchronized versioning across all stress test reports and diagnostic tools.

### Documentation & README
- **Full README Rewrite** — Rebuilt the README from scratch with separate installation guides for the Web Extension and MCP Server, a "Running Both Together" section, and a Quality-of-Life details section explaining design decisions.
- **All Four Benchmarks Published** — Added Web Context Engine, MCP Context Engine, MCP Project Isolation, and Knowledge Graph stress test results to the README with per-engine attribution breakdowns.
- **Shared Memory Clarified** — Explicitly documented that memory saved via the browser extension is immediately available to MCP tools and vice versa, sharing the same database.
- **MCP Setup Guide Updated** — `MCP_SETUP.md` troubleshooting and architecture sections updated to cover both Docker and Zero-Docker (SQLite) environments.
- **Environment Template** — Added `ARCRIFT_STORAGE_MODE` and `SQLITE_DB_PATH` to `backend/.env.example` for new user discoverability.

### CI & Tooling
- **Selector CI Expanded** — `scripts/check-selectors.js` now monitors all 7 supported platforms (added Grok, Copilot, Mistral alongside the original four).
- **Actionable Failure Alerts** — Selector CI now writes a structured `selector-failures.json` report on failure. The auto-created GitHub Issue now names the exact failing platforms and failure reasons in both the title and body, instead of asking developers to dig through workflow logs.
- **Interface Parity** — Added `hybridSearch` to the `IVectorStore` interface and implemented it in both Docker and SQLite backends.
- **MCP Server Version Handshake** — Updated the MCP server version string to `1.5.1` so connected tools (Claude, Cursor, Windsurf) receive the correct capability declaration.
- **Global Version Sync** — Synchronized `v1.5.1` across all package files, manifests, startup scripts, installer banners, source comments, and documentation files. Scrubbed all active `v1.4.x` references.

---

## [1.5.0] — 2026-05-13 — Documentation & Alignment

### Versioning & Alignment
- **Unified Versioning** — Synchronized version `1.5.0` across all modules: root setup, backend, dashboard, extension package, and manifest.
- **Architectural Cleanup** — Removed legacy `ARCRIFT_SECRET` requirement and updated all docstrings to reflect the current state of the platform.

### Documentation Overhaul
- **Standardized Context Format** — Updated all documentation to reflect the move from XML delimiters to the Lean Text Header (`=== ArcRift RETRIEVED CONTEXT ===`).
- **Npx-First Installation** — Refactored all "Getting Started" guides to prioritize `npx arcrift-setup` over manual cloning.
- **New ROADMAP.md** — Introduced a formal project roadmap for future milestones.
- **New TROUBLESHOOTING.md** — Created a comprehensive guide for common installation and runtime issues.
- **Architecture Sync** — Updated `ARCHITECTURE.md` and `RAG_PIPELINE.md` with accurate diagrams and thresholding logic.

---

## [1.4.7] — 2026-05-12 — Strict Identity & Precision RAG

### Identity & Anti-Hijacking
- **Strict Identity Architecture** — Sessions are now permanently anchored to platform-specific Chat URLs (`externalChatId`). 
- **SPA-Aware Navigation** — Added URL watchers to the Extension (Content Script & Popup) that detect "New Chat" clicks in Single Page Apps (ChatGPT/Claude/Gemini) without needing a page reload.
- **Identity Verification** — The backend now validates incoming Save requests against the URL; stale Session IDs from the extension are automatically ignored to prevent project overwrites.
- **Popup UX** — The Project Name field now remains empty for new chats, ensuring a "clean slate" workflow.

### RAG Precision & Token Efficiency
- **Hybrid Retrieval** — Implemented keyword boosting for search queries and corrected L2 distance scoring to prioritize exact conceptual matches.
- **Lean Context Injection** — Replaced heavy XML tags with a professional, token-efficient text header (`=== ArcRift RETRIEVED CONTEXT ===`).
- **Context Suppression** — ArcRift now automatically suppresses the context block if no relevant memories are found, saving tokens.

### Stability & Infrastructure
- **Resilient Database** — Implemented a robust SQLite migration for the `externalChatId` column and added `busy_timeout` to handle simultaneous dashboard polling.
- **Graph "Silent Sync"** — The Knowledge Graph now persists node coordinates and topology. The simulation only re-heats if the data structure changes, eliminating the "2-second pop" reset loop.
- **Console Cleanup** — User-facing errors (like duplicate project names) are now handled quietly in the background script to prevent "Red Error" badges in Chrome.

### Quality Assurance
- **Unit Tests** — Updated the full backend suite to align with the new Lean Header format.
- **Bug Fixes** — Resolved `ReferenceError: smartKey` and TypeScript indexing issues in the popup.

---

## [1.4.6] — 2026-05-11 — The ARCRIFT Rebrand

### Rebranding & Identity
- **Project Rebrand** — Transitioned the project identity from **Synq** to **ARCRIFT**.
- **CLI Refresh** — Updated the one-command installer to `npx arcrift-setup`.
- **Infrastructure Update** — Renamed all environment variables (`ARCRIFT_SECRET`, `ARCRIFT_STORAGE_MODE`), Docker containers, and internal storage keys.
- **Documentation Audit** — Comprehensive update of all guides, architecture diagrams, and repository metadata.
- **Extension Stability** — Fixed a crash in the popup when opened on restricted browser pages (`chrome://`, `edge://`).

---

## [1.4.5] — 2026-05-11 — Frictionless Setup & UI Refinement

### Installation & UX
- **One-Command Setup** — Introduced the automated repository cloning and installation script.
- **Automated Extension Loading** — The installer now automatically opens the extension folder and the Chrome extensions page.
- **Smart URL Mapping** — Enhanced session persistence across varied platform URL formats (e.g. shared chats).

### Dashboard & UI
- **Unified Header** — Consolidated the dashboard top bar, moving Load Extension and Fact/Chat tabs into a unified, clean layout.
- **Improved Alignment** — Fixed multiple layout regressions in the history list and chat bubbles.

### Backend & MCP
- **MCP Resilience** — Updated the Model Context Protocol server for parity.
- **Logging** — Standardized backend logs for improved debugging.

---

## [1.4.4] — 2026-05-10 — Architectural Hardening

### Retrieval & Process
- **RAG Benchmarking** — Introduced a quantitative harness to measure retrieval accuracy.
- **Context Budgeting** — Character-based context window management.
- **Memory Decay** — Time-based relevance scoring for aging conversations.
- **Data Portability** — Session export and import functionality.
- **Bug Fixes** — Resolved UI deadlocks caused by missing polling routes and ghost jobs remaining in the queue after a backend restart.
- **Test Coverage** — Expanded unit tests for DOM resolvers and extraction logic.


---

## [1.4.3] — 2026-05-09 — Hybrid Search & MCP Evolution

### Retrieval & Intelligence
- **Hybrid Search (Vector + Graph)** — Both the Dashboard and MCP server now perform Hybrid Retrieval. The system extracts entities from user prompts and queries the Knowledge Graph for structured facts, combining them with semantic vector chunks.
- **Global Hybrid Search** — `search_memory` now performs cross-project graph scans, improving discovery across multiple repositories.
- **Smart Project Detection** — Added `identify_active_project` MCP tool to automatically match a terminal's CWD to a ArcRift project ID.

### MCP (Model Context Protocol) Improvements
- **Dashboard Visibility** — Manual saves from MCP-compatible tools (Claude Code, Cursor) are now saved to the `full_chats` table and appear in the Dashboard history.
- **MCP Resources** — Exposed the entire Knowledge Graph as a browsable MCP Resource (`ArcRift://projects/{id}/graph`).
- **LLM Robustness** — Implemented try/catch fallbacks for AI extraction. If Ollama/Groq is unavailable, tools fallback gracefully to vector-only mode.
- **Config Generator** — Added `npm run mcp:config` to automatically generate absolute path configurations for AI tools.

### CI/CD & Maintenance
- **MCP Integration Tests** — Added automated tool verification to GitHub Actions, running on every PR in the SQLite-native environment.
- **Stability Fixes** — Resolved critical compilation errors and test regressions in the `isValidObjectId` validator.

---

## [1.4.2] — 2026-05-08 — SQLite Native (Zero-Docker) Migration

### Storage Architecture
- **Unified Storage Interface** — Introduced `ISessionStore`, `IGraphStore`, and `IVectorStore` interfaces.
- **SQLite Support** — Implemented `better-sqlite3` and `sqlite-vec` backends, allowing ArcRift to run without Docker (MongoDB, Neo4j, ChromaDB).
- **Dynamic Storage Factory** — Added `ARCRIFT_STORAGE_MODE` (docker/sqlite) to `.env` to toggle between legacy Docker and new local storage.

### Onboarding & Deployment
- **Zero-Docker Fallback** — `install.bat` and `install.sh` now automatically detect if Docker is missing/not running and default to SQLite mode.
- **Resource Efficiency** — SQLite mode reduces RAM requirement to 2GB and disk requirement to 5GB.
- **Version Alignment** — Synchronized version `1.4.2` across all modules: backend, dashboard, extension manifest, and MCP server.

### Maintenance & Fixes
- **Unified ID Validation** — Updated `isValidObjectId` to support both MongoDB ObjectIds and standard UUIDs for SQLite compatibility.
- **Jobs Worker** — Migrated background extraction worker to the unified storage layer.
- **MCP Server** — Full support for SQLite mode added to the Model Context Protocol server.

---

## [1.4.1] — 2026-05-05 — Expanding Platform Support

### Supported Platforms

- **New: DeepSeek (chat.deepseek.com)** — Full support. Leverages DeepSeek's stable `#chat-input` ID and product-specific `.ds-markdown` classes.
- All platforms (Claude, ChatGPT, Gemini, DeepSeek) now share the same multi-strategy resolver architecture.

### Automated Maintenance

- **Expanded Selector Monitoring** — `scripts/check-selectors.js` and the weekly GitHub Action now monitor all 4 platforms.
- **Fail-fast CI** — Selector staleness check updated to alert on DeepSeek regressions.

### Version Alignment

- Unified project versioning across extension manifest, extension package, backend, and dashboard to `1.4.1`.


## [1.4.0] — 2026-05-03 — Security, MCP & Production Hardening

### Security

- **Prompt injection defence** — `backend/src/middleware/sanitize.ts` scans every retrieved RAG chunk for 10 known injection patterns before it reaches any AI. Matching content is replaced with `[Content redacted: potential prompt injection pattern detected]`
- **XML context delimiters** — all injected context is wrapped in `<ARCRIFT_retrieved_context>` XML tags. LLMs treat XML-tagged content as structured data rather than executable instructions
- **SECURITY.md** — expanded with prompt injection threat model and Groq privacy disclosure

### MCP Server — Universal Memory Layer

- New: `backend/src/mcp/server.ts` — standalone stdio MCP server compatible with Claude Code, Cursor, Windsurf, and Claude Desktop
- Five tools: `recall_context`, `store_memory`, `search_memory`, `list_projects`, `get_project_summary`
- All tools use the same MongoDB, ChromaDB, and Neo4j databases as the Chrome extension
- New: `MCP_SETUP.md` — copy-paste setup guide for all supported AI tools

### Resilient Selectors

- New: `extension/src/platform/resolver.ts` — multi-strategy DOM selector resolver
- Each platform now has 4–7 ordered fallback strategies: testid → aria-label → role → placeholder → generic contenteditable
- `MutationObserver` in `watchForInput()` auto-reconnects when the input is not yet in the DOM (SPA navigation)
- Claude, ChatGPT, and Gemini platform files updated to use `INPUT_SELECTOR_STRATEGIES` from the resolver

### Smart Ollama / Groq Auto-Detect

- `extractor.ts` — probes Ollama at startup. Uses `llama3.1:8b` locally if available; falls back to Groq with an explicit privacy warning if not
- `GROQ_API_KEY` removed from mandatory env validation — now strictly optional
- New env vars: `GRAPH_BACKEND` (force `ollama` or `groq`), `OLLAMA_MODEL` (default: `llama3.1:8b`)

### Production Dashboard

- `backend/src/index.ts` — `sirv` middleware serves `dashboard/dist/` as static files on port 3001
- No separate Vite dev server needed. Dashboard URL: `http://localhost:3001`
- Dashboard build reduced from ~5 MB to ~319 KB (gzip: 105 KB)
- CORS allowlist updated to include `localhost:3001`

### Lite Mode

- `docker-compose.yml` — added `full` and `lite` profiles. Neo4j tagged as `full` only
- New: `docker-compose.lite.yml` — standalone file with only MongoDB + ChromaDB

### Installers & Launchers

- New: `install.sh` — one-command first-time setup for macOS/Linux (~3 min)
- New: `install.bat` — one-command first-time setup for Windows
- Updated: `start.bat` — RAM detection (WMIC), `llama3.1:8b` model check, dashboard build step, plain ASCII output (no box-drawing characters)
- Updated: `start.sh` — RAM detection, Docker profiles, builds production dashboard instead of starting Vite dev server, adds MCP reference

### CI/CD & Maintenance

- New: `.github/workflows/integration-tests.yml` — full RAG pipeline integration test on every PR
- New: `.github/workflows/selector-check.yml` — weekly headless check for selector staleness; auto-creates GitHub issues
- New: `.github/workflows/release.yml` — auto-creates GitHub Release with extension zip on version tags
- New: `backend/tests/integration/pipeline.integration.test.ts` — seeds a fixture and asserts end-to-end retrieval
- New: `ROADMAP.md` — versioned milestones and planned features

### TypeScript

- `backend/tsconfig.json` — `include: ["src/**/*"]` explicit, `tests/` excluded from rootDir, `resolveJsonModule: true` added. Compilation: 0 errors.

---

## [1.3.3] — 2026-05-03 — Startup Robustness

- Forced Docker Compose project name to `ArcRift` — prevents errors when the repository folder has dots or version numbers in the name
- Removed Unicode box-drawing characters from `start.bat` that caused rendering errors in Windows CMD

---

## [1.3.2] — 2026-05-03 — UI Refinement & Extension Features

### Dashboard

- Complete UI overhaul — new layout and color palette
- Granular graph settings (node size, position, tension)
- Collapsible left sidebar (Facts + Chat tabs)
- Fixed staggered graph rendering lag on large knowledge graphs
- Resolved UI arrow/connection rendering errors

### Extension

- Multi-save support — same chat can be saved multiple times without duplicate sessions
- Unload Session button — explicitly disconnect from active session
- Pause/Resume always visible in compact UI layout
- Badge toggle — click the ArcRift badge to toggle on/off instantly
- Save button contrast fix

---

## [1.3.1] — 2026-05-01 — Scripts & Documentation

- Fixed `start.bat` and `start.sh` parenthesis/pipe parsing errors
- Added automatic Ollama and backend dependency checks in launchers
- Suppressed npm deprecation warnings in build output
- README: added project logo and demo video
- Added `.gitattributes` and updated `.gitignore` for extension `/dist`

---

## [1.3.0] — 2026-04-27 — UI/UX Overhaul & Open Source Readiness

### Dashboard — Graph

- Degree-scaled nodes: 8–60px radius — hub nodes visually dominant
- Curved quadratic bezier edges with hover-reveal labels
- Per-type colored glow filters (22 types)
- Hover tooltip: name, type, connection count
- Zoom controls (+/−/reset)
- 3D radial gradient fills

### Dashboard — Chat Viewer

- Color-coded conversation: user messages right-aligned (indigo), assistant left-aligned (cyan)
- Turn parser from raw text into styled bubbles
- Header stats: turn count, message count, save date

### Dashboard — App Shell

- Sidebar redesign with Outfit typeface
- Skeleton loaders during data loading
- Error banner when backend is unreachable
- React hook lint errors resolved (0 ESLint errors)

### Open Source

- Added `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`
- Added `CHANGELOG.md`, `ARCHITECTURE.md`, `RAG_PIPELINE.md`, `PLATFORM_SELECTORS.md`, `SELF_HOSTING.md`, `CONTRIBUTING.md`

---

## [1.2.0] — 2026-04-26 — Zero-Loss RAG + Auto-Connect

### RAG Pipeline

Replaced the Groq topic splitter with a pure sliding window chunker:

| | Groq Topic Splitter | Sliding Window Chunker |
|---|---|---|
| Personal facts | Deleted as "filler" | Preserved verbatim |
| Short messages | Rejected | Always included |
| API call on save | Yes | None |
| Data loss | Significant | Zero |

### Auto-Connect

Replaced manual Connect button with automatic interceptor attachment on init(). Simple Pause/Resume toggle replaces the connect state machine.

### Knowledge Graph

- Entity types: 12 → 22 (added: Person, Pet, Goal, Problem, Preference, Habit, Tool, Pattern, Location, Organization)
- Relation types: ~6 → 20+ (added: OWNS, NAMED, PREFERS, WANTS, KNOWS, IS_BUILDING, SOLVED_WITH, etc.)

### Bug Fixes

- Infinite loop in chunker when `overlapWords >= windowWords` — clamped to `windowWords - 1`
- `start.bat` closed immediately — missing `call` keyword before all `npm`/`npx` invocations
- Session change not broadcast to other tabs — fixed with `broadcastSessionChanged()`

---

## [1.1.0] — 2026-04-25 — Security & Reliability Audit

- CORS locked from wildcard to explicit allowlist
- Rate limiting: 200 req/min global; 10 req/min on `/api/chat/save`
- sessionId validated as MongoDB ObjectId on all routes
- Body limit reduced from 50 MB to 5 MB
- Embeddings generated in parallel via `Promise.all` (was sequential)
- Neo4j connection with exponential backoff retry (5 attempts)
- Project summary cached in `Session.summary`
- All `console.log` replaced with structured `logger` utility

---

## [1.0.0] — 2026-04-24 — Initial Release

- Chrome extension: Claude, ChatGPT, Gemini support
- Groq LLaMA 3.1 knowledge graph extraction
- MongoDB session and FullChat storage
- Neo4j semantic graph (12 entity types)
- Classic Inject (structured summary pasted into input)
- React dashboard with D3.js force graph
- Docker Compose infrastructure
