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

## v1.5.4 — Released

Multi-turn context summarisation, session merging, and Ollama model switcher.
See [CHANGELOG.md](CHANGELOG.md) for the full list.

---

## v1.5.5 — Released

Session Analytics, Manual Graph Editing with D3 context menus, and Background Auto-Backups.
See [CHANGELOG.md](CHANGELOG.md) for the full list.

---

## v1.5.6 — Planned

- **Direct Codebase Indexing (Local File RAG)** — An expansion to the MCP server that allows ArcRift to scan and index the user's actual project files into the graph, bridging the gap between conversational memory and actual code architecture.
- **Native Desktop App wrapper (Tauri)** — Package the Node backend and React Dashboard into a lightweight Tauri desktop app with a menu-bar icon, eliminating the need to keep a terminal window open.

---

## v1.6.0 — Planned (Major Release)

- **1. Team "Hive-Mind" Memory (Enterprise Sync)** — Optional remote database support (Turso/Postgres) allowing an entire engineering team to share a unified memory graph. If one developer solves an issue, the rest of the team's IDEs instantly recall the solution.
- **2. Automated Memory Decay (Forgetting)** — Implementing an automated algorithmic "decay" system where outdated or conflicting facts slowly fade from the graph over time if they aren't frequently accessed or reinforced, keeping the memory retrieval lightning fast and contextually pure over years of use.

---
