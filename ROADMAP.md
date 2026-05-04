# SYNQ — Roadmap

Current version: **v1.4.1**

---

## Shipped

### v1.4.1
- New Platforms: Perplexity.ai and DeepSeek support
- Resilient selectors for all 5 platforms with multi-strategy fallbacks
- Enhanced weekly CI selector monitoring for Perplexity and DeepSeek
- Version alignment across all packages to 1.4.1

### v1.4.0
- Prompt injection defence (pattern scan + XML context delimiters)
- MCP Server — Claude Code, Cursor, Windsurf, Claude Desktop
- Resilient multi-strategy DOM selectors + weekly CI staleness check
- Smart Ollama/Groq auto-detect (Ollama primary, Groq fallback)
- Production dashboard served from backend via sirv (port 3001)
- Lite mode — Docker Compose profiles for < 8 GB RAM machines
- One-command installers (install.sh + install.bat)
- Full pipeline integration test in CI
- GitHub Releases automation

### v1.3.x
- Collapsible sidebar, graph settings panel
- Extension badge toggle (click to pause/resume)
- Multi-save support, Unload Session button
- Complete UI overhaul

### v1.2.0
- Zero-loss sliding window RAG pipeline (replaced lossy Groq topic splitter)
- Auto-Connect (replaced manual connect flow)
- Parallel embedding generation
- Knowledge graph: 12 → 22 entity types, 6 → 20+ relation types

### v1.1.0
- Security audit: CORS locked, rate limiting, input validation, body limit
- Neo4j exponential backoff retry
- Structured logger utility

### v1.0.0
- Initial release: Chrome extension, knowledge graph, RAG, dashboard

---

## In Progress — v1.5.0

- **Session export** — download your memory as JSON or Markdown
- **Manual memory editing** — edit or delete individual stored chunks from the dashboar
- **Conversation search** — full-text search across all saved FullChat documents

---

## Planned — v1.6.0

- **Firefox extension** — port the Chrome extension to Firefox MV3
- **Graph filtering** — filter the knowledge graph by entity type or relation
- **Memory decay** — optional TTL on stored chunks; old context fades out automatically
- **Multi-device sync** — optional encrypted sync across machines via a self-hosted relay

---

## Exploring — v2.0

- **Auto-recall** — SYNQ proactively surfaces memory without being explicitly asked, based on what you're currently typing
- **Memory summarisation** — periodically compress old chunks into higher-level summaries to reduce storage
- **Team memory** — shared project memory accessible by multiple developers
- **Local embedding alternatives** — support for alternative embedding models (e.g. `mxbai-embed-large`)

---

## Contributing

Want to work on any of these? Open a discussion or check the [`good first issue`](https://github.com/Eshaan-Nair/Synq/issues?q=is%3Aissue+label%3A%22good+first+issue%22) label.
