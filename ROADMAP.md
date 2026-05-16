# GLIA — Roadmap

This document tracks planned features and improvements by version.
Completed items are in [CHANGELOG.md](CHANGELOG.md).

---

## Icebox (No Fixed Version)

- **Browser support beyond Chrome** — Firefox MV3 port.
- **Cloud storage backend** — Optional Supabase or PocketBase backend for
  synced memory across machines, keeping the local-first default.
- **Voice note capture** — Transcribe voice notes via Whisper and save them
  directly to a GLIA project.
- **MCP Tool Improvements** — Add new tools to the MCP server for additional
  functionality and improve existing tools with more features.

## v1.5.1 — Released

Core hardening, documentation overhaul, and CI improvements.
See [CHANGELOG.md](CHANGELOG.md) for the full list.

---

## v1.5.2 — In Progress

### Dashboard

- **Global Search Bar** — A search input in the dashboard UI that queries
  `search_memory` across all projects and renders results with project
  attribution. The backend tool already exists; this is a frontend addition.

- **Knowledge Graph Pruning** — Click a node in the D3 force graph to
  surface a "Prune" button that deletes the fact via the `prune_memory`
  backend endpoint. Pure frontend addition.

- **System Health Panel** — Live view of SQLite metrics: chunk count,
  session count, job queue status, active storage mode, and Ollama status.

### Backend

- **Production Log Verbosity** — Move storage-layer logs (HyDE queries,
  embedding batches, session lookups) from `info` to `debug` level so the
  terminal is quiet in production. Set `LOG_LEVEL=debug` to restore them.

### Extension

- **Visible Error State** — When the extension fails to find the input
  element on a supported platform (selector stale), show a warning badge
  in the popup instead of silently skipping injection.

### CI

- **SQLite-native Pipeline Test** — Supplement or replace the Docker-
  dependent `pipeline-tests` CI job with a SQLite-mode equivalent that
  runs without ChromaDB or MongoDB service containers.

---

## v1.5.3 — Planned

- **Multi-turn Context Summarisation** — Instead of injecting raw chunks,
  generate a short prose summary of the most relevant project context and
  inject that. Reduces token usage and improves readability for the AI.

- **Session Merging** — Allow two saved sessions to be merged into one
  project, de-duplicating overlapping chunks and combining their knowledge
  graphs. Useful when a long project spans many separate conversations.

- **Ollama Model Switcher** — A dropdown in the dashboard to change the
  active embedding or extraction model without editing `.env` and restarting.

- **Export / Import** — Export a project's memory to a `.json` file and
  import it on another machine. Enables portable knowledge bases.

---
