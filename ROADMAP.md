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

- **Session Merging** — Allow two saved sessions to be merged into one
  project, de-duplicating overlapping chunks and combining their knowledge
  graphs. Useful when a long project spans many separate conversations.

- **Ollama Model Switcher** — A dropdown in the dashboard to change the
  active embedding or extraction model without editing `.env` and restarting.

- **Export / Import** — Export a project's memory to a `.json` file and
  import it on another machine. Enables portable knowledge bases.

---
