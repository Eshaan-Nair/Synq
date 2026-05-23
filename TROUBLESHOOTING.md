# ArcRift — Troubleshooting Guide

If you're running into issues with ArcRift, check the common solutions below.

## Installation Issues

### `npx ARCRIFT-setup` fails
- **Permissions:** Try running as Administrator (Windows) or using `sudo` (macOS/Linux).
- **Node.js Version:** Ensure you are on Node.js 20 LTS or higher. Check with `node -v`.
- **Git:** Make sure Git is installed and available in your PATH.

### `docker compose` fails
- **Docker Not Running:** Ensure Docker Desktop is open and the engine has started.
- **Port Conflict:** If port 3001, 27017, 8000, or 7687 is already in use, ArcRift will fail to start. Use `docker ps` to see if old containers are still running.
- **Resource Limits:** Ensure Docker has at least 4 GB of RAM allocated (8 GB recommended for Full mode).

---

## Extension Issues

### Save Chat returns "0 messages found"
- **Platform Update:** The AI platform (Claude/ChatGPT/Gemini) may have updated their website. Check [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md) for how to diagnose and report stale selectors.
- **Refresh Page:** Try refreshing the page. In single-page apps (SPAs), the extension may sometimes lose track of the DOM state.

### Context Injection not working (Auto-Connect)
- **Check Status Dot:** Click the ArcRift icon in the toolbar. Ensure it says "ArcRift ON".
- **Session Selection:** Make sure a session is actually active for the current URL.
- **Browser Compatibility:** ArcRift is tested on Chrome and Edge. Brave users may need to disable "Shields" for the AI platform sites.

---

## Backend & Database Issues

### "Ollama connection failed"
- **Is Ollama running?** Open `http://localhost:11434` in your browser. You should see "Ollama is running".
- **Missing Models:** Run `ollama pull nomic-embed-text` and `ollama pull llama3.1:8b`.

### "ChromaDB/MongoDB connection failed"
- Check container status: `docker compose ps`.
- Check logs: `docker compose logs backend`.

### High CPU usage
- ArcRift runs embeddings and extraction locally via Ollama. This is CPU-intensive. Extraction typically takes 5–15 seconds per save. If it hangs, try restarting Ollama.

---

## MCP Issues

### "Server not found" in AI tool
- **Absolute Paths:** Ensure the path in your `mcpServers` config is an **absolute path** (e.g., `C:/Users/Name/ARCRIFT/backend/dist/mcp/server.js`).
- **Build First:** You must run `npm run build` in the `backend/` directory before using the MCP server.

---

## Still having trouble?
1. Check the [Discussion Board](https://github.com/Eshaan-Nair/ARCRIFT/discussions).
2. Open a [GitHub Issue](https://github.com/Eshaan-Nair/ARCRIFT/issues) with your backend logs and system details.
