# GLIA MCP Server — Setup Guide

The GLIA MCP server exposes your conversation memory to any MCP-compatible AI tool. After setup, your AI tool can call GLIA tools directly — no browser extension needed.

---

## Prerequisites

1. GLIA backend has been built:
   ```bash
   cd backend && npm run build
   ```
   This produces `backend/dist/mcp/server.js`.

2. Docker databases are running:
   ```bash
   docker compose --profile full up -d
   # or: start.bat / start.sh (does this automatically)
   ```

3. Ollama is running with the required models:
   ```bash
   ollama serve
   ollama pull nomic-embed-text
   ollama pull llama3.1:8b
   ```

---

## Tools Available

| Tool | What it does |
|---|---|
| `recall_context` | Retrieves top-N memory chunks (Hybrid Search). Call this at the start of a session. |
| `store_memory` | Saves text/chat to GLIA memory. **Updates Dashboard History**. |
| `search_memory` | Global Hybrid Search across all projects and sessions. |
| `list_projects` | Lists all saved project names with metadata. |
| `get_project_summary` | Returns the knowledge graph summary for a project. |
| `identify_active_project`| Automatically matches your CWD to a Glia Project ID. |

---

## Fast Setup (Recommended)

Instead of manually editing JSON files, use the configuration generator:

```bash
cd backend
npm run mcp:config
```

This will output a pre-formatted JSON block with all absolute paths detected for your machine. Copy and paste it into your AI tool's configuration.

---

## Claude Desktop

Config file location:
- **macOS:** `~/.claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["C:/path/to/Glia/backend/dist/mcp/server.js"]
    }
  }
}
```

Restart Claude Desktop. GLIA tools appear in the tool picker.

---

## Claude Code

```bash
# In your project directory:
claude mcp add glia node /path/to/Glia/backend/dist/mcp/server.js

# Or add to .mcp.json in your project root:
```

`.mcp.json`:
```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["/path/to/Glia/backend/dist/mcp/server.js"]
    }
  }
}
```

---

## Cursor

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["/path/to/Glia/backend/dist/mcp/server.js"]
    }
  }
}
```

Restart Cursor. GLIA appears in the MCP tool list.

---

## Windsurf

Create `.windsurf/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "glia": {
      "command": "node",
      "args": ["/path/to/Glia/backend/dist/mcp/server.js"]
    }
  }
}
```

---

## Usage Examples

Once connected, your AI tool can use GLIA tools like this:

**At the start of a session:**
> "Use recall_context to retrieve relevant memory for: implementing JWT refresh token rotation"

**After completing work:**
> "Use store_memory to save this: We implemented refresh token rotation using Redis for token invalidation. The key insight was using a sliding expiry window."

**Finding past decisions:**
> "Use search_memory to find everything we discussed about authentication"

**Getting a project overview:**
> "Use get_project_summary for project: AuthService"

---

## Troubleshooting

**"ChromaDB / SQLite collection not found"**
No memory has been saved yet. Ensure the backend is running in the correct mode (Docker or SQLite).

**"MongoDB / SQLite connection failed"**
The database is unreachable. Check if Docker is running (Docker mode) or if `backend/glia.db` exists (SQLite mode).

**"Ollama embedding failed"**
Ollama is not running. Run `ollama serve` then `ollama pull nomic-embed-text`.

**Tool returns empty results**
Save some conversations using the Chrome extension first — the MCP server reads from the same memory store.

**Server not found in AI tool**
Make sure the path to `backend/dist/mcp/server.js` is an absolute path (not relative). On Windows, use forward slashes or double backslashes.

---

The MCP server connects to the same databases (Docker or SQLite) as the backend:
- **ChromaDB / SQLite-vec** for vector search (`recall_context`, `search_memory`)
- **MongoDB / SQLite** for session metadata (`list_projects`, `store_memory`)
- **Neo4j / SQLite** for knowledge graph summaries (`get_project_summary`)

Memory saved via the Chrome extension is immediately available to MCP tools, and vice versa. They share the same data store.
