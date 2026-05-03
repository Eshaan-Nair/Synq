#!/usr/bin/env bash
# start.sh - SYNQ Daily Launcher v1.4.0
# For first-time setup, run ./install.sh instead.

# Always run from the script's own directory
cd "$(dirname "$0")"

export COMPOSE_PROJECT_NAME=synq

echo ""
echo "  Starting SYNQ v1.4.0..."
echo ""

# Check .env exists
if [ ! -f "backend/.env" ]; then
  echo "  ERROR: backend/.env not found."
  echo "  Run: cp backend/.env.example backend/.env"
  echo "  Then open backend/.env and fill in your values."
  exit 1
fi

# Check Ollama + models
echo "  Checking Ollama..."
if ! command -v ollama &>/dev/null; then
  echo "  WARNING: Ollama not found. RAG and graph features will be unavailable."
  echo "           Install from https://ollama.com then run install.sh"
  echo ""
else
  if ollama show nomic-embed-text >/dev/null 2>&1; then
    echo "  nomic-embed-text ready"
  else
    echo "  Pulling nomic-embed-text (~270 MB, one-time)..."
    if ollama pull nomic-embed-text; then
      echo "  nomic-embed-text ready"
    else
      echo "  WARNING: Failed to pull nomic-embed-text. Run: ollama pull nomic-embed-text"
    fi
  fi

  if ollama show llama3.1:8b >/dev/null 2>&1; then
    echo "  llama3.1:8b ready"
  else
    echo "  Pulling llama3.1:8b (~4.7 GB, one-time graph extraction model)..."
    if ollama pull llama3.1:8b; then
      echo "  llama3.1:8b ready"
    else
      echo "  WARNING: Failed to pull llama3.1:8b."
      echo "           Graph extraction will fall back to Groq if GROQ_API_KEY is set."
    fi
  fi
fi
echo ""

# Detect RAM and pick Docker profile
RAM_GB=16
if [[ "$(uname)" == "Linux" ]]; then
  RAM_GB=$(awk '/MemTotal/{printf "%.0f", $2/1024/1024}' /proc/meminfo)
elif [[ "$(uname)" == "Darwin" ]]; then
  RAM_GB=$(sysctl -n hw.memsize | awk '{printf "%.0f", $1/1024/1024/1024}')
fi

if [ "$RAM_GB" -lt 8 ]; then
  PROFILE="${SYNQ_PROFILE:-lite}"
  echo "  RAM: ~${RAM_GB} GB detected - starting LITE mode (no Neo4j)"
else
  PROFILE="${SYNQ_PROFILE:-full}"
  echo "  RAM: ~${RAM_GB} GB detected - starting FULL mode"
fi

# Start databases
echo "  Starting Docker containers (profile: $PROFILE)..."
if docker compose --profile "$PROFILE" up -d 2>/dev/null; then
  echo "  Databases running"
else
  echo "  Retrying with legacy docker-compose..."
  if [ "$PROFILE" = "lite" ]; then
    docker-compose -f docker-compose.lite.yml up -d || { echo "  ERROR: Docker failed to start."; exit 1; }
  else
    docker-compose up -d || { echo "  ERROR: Docker failed to start."; exit 1; }
  fi
  echo "  Databases running"
fi
echo ""

sleep 3

# Build extension
echo "  Building extension..."
cd extension
if [ ! -f "node_modules/.bin/esbuild" ]; then
  echo "  Installing extension dependencies..."
  npm install --loglevel warn || { echo "  ERROR: Extension install failed."; cd ..; exit 1; }
fi

npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020 && echo "  content.js ready"    || echo "  WARNING: content.ts failed"
npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 && echo "  background.js ready" || echo "  WARNING: background.ts failed"
npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020 && echo "  popup.js ready"      || echo "  WARNING: popup.ts failed"
cd ..
echo ""

# Build dashboard for production (if not already built)
if [ ! -d "dashboard/dist" ]; then
  echo "  Building dashboard for production (first time)..."
  cd dashboard
  if [ ! -f "node_modules/.bin/vite" ]; then
    npm install --loglevel warn
  fi
  npm run build && echo "  Dashboard built" || echo "  WARNING: Dashboard build failed. Backend API will still work."
  cd ..
else
  echo "  Dashboard already built - serving from backend at http://localhost:3001"
fi
echo ""

# Start backend
echo "  Starting backend on port 3001..."
cd backend
if [ ! -f "node_modules/.bin/ts-node-dev" ]; then
  echo "  Installing backend dependencies..."
  npm install --loglevel warn || { echo "  ERROR: Backend install failed."; cd ..; exit 1; }
fi
npm run dev &
BACKEND_PID=$!
cd ..
echo "  Backend started (PID $BACKEND_PID)"
echo ""

# Wait for health
echo "  Waiting for backend to start..."
HEALTH_OK=0
for i in $(seq 1 10); do
  sleep 2
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q "200"; then
    HEALTH_OK=1
    break
  fi
done

if [ "$HEALTH_OK" -eq 0 ]; then
  echo "  WARNING: Backend health check timed out. Check terminal for errors."
else
  echo "  Backend is healthy"
fi
echo ""

# Summary
echo "  SYNQ is ready!

  To start SYNQ daily, just run: ./start.sh

  Dashboard     : http://localhost:3001 (after starting)
  Backend       : http://localhost:3001/health"
if [ "$PROFILE" = "full" ]; then
echo "  Neo4j UI   : http://localhost:7474"
fi
echo "  ChromaDB   : http://localhost:8000"
echo "  MongoDB    : mongodb://localhost:27017"
echo ""
echo "  Extension  : load /extension/dist in chrome://extensions (Developer mode)"
echo "  MCP setup  : see MCP_SETUP.md"
echo ""
echo "  Press Ctrl+C to stop everything."
echo ""

# Cleanup on Ctrl+C
cleanup() {
  echo ""
  echo "  Stopping SYNQ..."
  kill $BACKEND_PID 2>/dev/null || true
  docker compose stop 2>/dev/null || docker-compose stop 2>/dev/null || true
  echo "  Done."
}
trap cleanup INT TERM
wait