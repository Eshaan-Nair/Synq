# ArcRift — Roadmap

This document tracks planned features and improvements by version.
Completed items are in [CHANGELOG.md](CHANGELOG.md).

---

## Icebox (No Fixed Version)

- **Browser support beyond Chrome** — Firefox MV3 port.
- **Cloud storage backend** — Optional Supabase or PocketBase backend for
  synced memory across machines, keeping the local-first default.
- **Voice note capture** — Transcribe voice notes via Whisper and save them
  directly to a ArcRift project.
- **MCP Tool Improvements** — Add new tools to the MCP server for additional
  functionality and improve existing tools with more features.

## v1.5.3 — Released

Global search graph facts, system health panel, extension warning badge, storage-agnostic CI tests.
Rebrand to ArcRift, UI Restructure
See [CHANGELOG.md](CHANGELOG.md) for the full list.

---

## v1.5.4 — Planned

- **Multi-turn Context Summarisation** — Instead of injecting raw chunks,
  generate a short prose summary of the most relevant project context and
  inject that. Reduces token usage and improves readability for the AI.

- **Session Merging** [Completed] — Allow two saved sessions to be merged into one
  project, de-duplicating overlapping chunks and combining their knowledge
  graphs. Useful when a long project spans many separate conversations.

- **Ollama Model Switcher** [Completed] — A dropdown in the dashboard to change the
  active embedding or extraction model without editing `.env` and restarting.

---

## v1.5.5 — Planned

- **Settings & Session Analytics Tab** — A dedicated settings page in the dashboard that displays per-session analytics (tokens saved, compression ratios, total API cost reduced), alongside configurations for Ollama models and context thresholds.
- **Manual Graph Editing** — The ability to right-click a node on the D3.js visual dashboard and manually edit its name, or sever a specific relationship edge without using the CLI.
- **Background Auto-Backup** — Automatically dump a `.sqlite` snapshot to a backup folder once a week to prevent memory corruption or loss.

---

## v1.5.6 — Planned

- **Direct Codebase Indexing (Local File RAG)** — An expansion to the MCP server that allows ArcRift to scan and index the user's actual project files into the graph, bridging the gap between conversational memory and actual code architecture.
- **Native Desktop App wrapper (Tauri)** — Package the Node backend and React Dashboard into a lightweight Tauri desktop app with a menu-bar icon, eliminating the need to keep a terminal window open.

---

## v1.6.0 — Planned (Major Release)

- **1. Team "Hive-Mind" Memory (Enterprise Sync)** — Optional remote database support (Turso/Postgres) allowing an entire engineering team to share a unified memory graph. If one developer solves an issue, the rest of the team's IDEs instantly recall the solution.
- **2. Automated Memory Decay (Forgetting)** — Implementing an automated algorithmic "decay" system where outdated or conflicting facts slowly fade from the graph over time if they aren't frequently accessed or reinforced, keeping the memory retrieval lightning fast and contextually pure over years of use.

---
