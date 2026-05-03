#!/usr/bin/env bash
# install.sh - SYNQ One-Command Installer v1.4.0
# Full first-time setup for macOS / Linux
# Re-run at any time - it is idempotent.
#
# Usage: chmod +x install.sh && ./install.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; RESET="\033[0m"
ok()   { echo -e "${GREEN}  OK  $*${RESET}"; }
warn() { echo -e "${YELLOW}  WARN $*${RESET}"; }
err()  { echo -e "${RED}  ERR  $*${RESET}" >&2; }

echo ""
echo "  SYNQ Installer v1.4.0"
echo "  Setting up everything..."
echo ""

# 1. Check Docker
if ! command -v docker &>/dev/null; then
  err "Docker not found. Install from https://docker.com/get-started"; exit 1
fi
if ! docker info &>/dev/null; then
  err "Docker daemon not running. Start Docker Desktop first."; exit 1
fi
ok "Docker ready"

# 2. Check Node.js
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install v20 LTS from https://nodejs.org"; exit 1
fi
ok "Node.js $(node -e "process.stdout.write(process.version)")"

# 3. Check / install Ollama
if ! command -v ollama &>/dev/null; then
  warn "Ollama not found - installing..."
  if [[ "$(uname)" == "Darwin" ]]; then
    brew install ollama 2>/dev/null || curl -fsSL https://ollama.ai/install.sh | sh
  else
    curl -fsSL https://ollama.ai/install.sh | sh
  fi
  ok "Ollama installed"
else
  ok "Ollama already installed"
fi

# Start Ollama if not running
if ! curl -sf http://localhost:11434 &>/dev/null; then
  warn "Starting Ollama server..."
  ollama serve &>/dev/null &
  sleep 4
fi

# 4. Pull required models
echo ""
echo "  Pulling Ollama models (one-time downloads)..."

if ! ollama show nomic-embed-text &>/dev/null; then
  echo "  Pulling nomic-embed-text (~270 MB - embedding model)..."
  ollama pull nomic-embed-text
  ok "nomic-embed-text ready"
else
  ok "nomic-embed-text already pulled"
fi

if ! ollama show llama3.1:8b &>/dev/null; then
  echo "  Pulling llama3.1:8b (~4.7 GB - graph extraction model, one-time)..."
  ollama pull llama3.1:8b
  ok "llama3.1:8b ready"
else
  ok "llama3.1:8b already pulled"
fi

# 5. Install npm dependencies
echo ""
echo "  Installing npm dependencies..."
npm install --prefix backend  --loglevel error && ok "backend deps installed"
npm install --prefix dashboard --loglevel error && ok "dashboard deps installed"
npm install --prefix extension --loglevel error && ok "extension deps installed"

# 6. Build everything
echo ""
echo "  Building for production..."
npm run build --prefix dashboard && ok "dashboard built -> dashboard/dist"
(cd extension && npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020)
(cd extension && npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020)
(cd extension && npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020)
ok "extension built -> extension/dist"

(cd backend && npm run build 2>/dev/null || true)
ok "backend compiled"

# 7. Set up .env
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  warn "Created backend/.env from .env.example - review settings before production use"
fi

# 8. Detect RAM and pick Docker profile
echo ""
RAM_GB=16
if [[ "$(uname)" == "Linux" ]]; then
  RAM_GB=$(awk '/MemTotal/{printf "%.0f", $2/1024/1024}' /proc/meminfo)
elif [[ "$(uname)" == "Darwin" ]]; then
  RAM_GB=$(sysctl -n hw.memsize | awk '{printf "%.0f", $1/1024/1024/1024}')
fi

if [ "$RAM_GB" -lt 8 ]; then
  PROFILE="${SYNQ_PROFILE:-lite}"
  warn "${RAM_GB} GB RAM detected - starting LITE mode (no Neo4j)"
  warn "To run full mode: SYNQ_PROFILE=full ./install.sh"
else
  PROFILE="${SYNQ_PROFILE:-full}"
  ok "${RAM_GB} GB RAM detected - starting FULL mode"
fi

# 9. Start Docker services
echo ""
echo "  Starting Docker containers (profile: $PROFILE)..."
docker compose --profile "$PROFILE" up -d
sleep 5

# 10. Health checks
echo ""
echo "  Running health checks..."
if curl -sf http://localhost:8000/api/v1/heartbeat &>/dev/null; then
  ok "ChromaDB  - http://localhost:8000"
else
  warn "ChromaDB not yet healthy - check: docker compose logs chromadb"
fi

if [ "$PROFILE" = "full" ]; then
  if curl -sf http://localhost:7474 &>/dev/null; then
    ok "Neo4j     - http://localhost:7474"
  else
    warn "Neo4j may still be initialising - check: docker compose logs neo4j"
  fi
fi

# 11. Next steps
echo ""
echo "  SYNQ is ready!

  To start SYNQ daily, just run: ./start.sh

  Dashboard     : http://localhost:3001 (after starting)
"
echo ""
echo "  Extension:"
echo "    Load $(pwd)/extension/dist in chrome://extensions (Developer mode)"
echo ""
echo "  MCP (Claude Code / Cursor / Windsurf):"
echo "    See MCP_SETUP.md"
echo ""
