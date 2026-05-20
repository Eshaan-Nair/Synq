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

## v1.5.2 — Released

Global search graph facts, system health panel, extension warning badge, storage-agnostic CI tests.
See [CHANGELOG.md](CHANGELOG.md) for the full list.

---

## v1.5.3 — Planned

### Rebrand

- **New Name & Identity** — Retire the "Glia" name due to brand collision with
  an established fintech platform. Select a unique, memorable name and update
  all user-facing strings: the dashboard title, sidebar logo, extension popup,
  README, `package.json` names, and Docker image tags.

- **Updated Visual Identity** — Refresh the colour palette and logo to match
  the new brand. Update the landing page at `glia-ai.vercel.app` with the new
  name and visual language.

- **Namespace & Repository Migration** — Rename the GitHub repository, update
  the `npx` setup script name (e.g. `npx <new-name>-setup`), and redirect any
  existing deep links.

### UI Restructure

- **Redesigned Dashboard Layout** — Move the global search to the sidebar or a
  dedicated command-palette (`⌘K`) overlay so it no longer competes with the
  top-right action bar. Introduce a persistent left-rail navigation for
  Projects, Graph, Facts, and Settings.

- **Command Palette (`⌘K`)** — A keyboard-driven command palette for search,
  session switching, and common actions — replaces the header search bar.

- **Consolidated Settings Page** — Pull the scattered controls (log level,
  storage mode, Ollama model, min-degree slider) into a dedicated Settings
  panel accessible from the sidebar rail.

- **Responsive / Resizable Panels** — Make the Facts / Chat floating panel
  draggable and resizable so users can control the split between the graph and
  the side panel.

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
