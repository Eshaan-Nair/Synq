#!/bin/bash
# Error handling is done explicitly per-section.
# Top-level `set -e` is intentionally omitted -- it causes the script to
# silently exit on non-zero returns (e.g. ollama not running) before any
# warning messages can print.

echo ""
echo " Starting SYNQ..."
echo ""

# -- Check .env exists -------------------------------------------------------
if [ ! -f "backend/.env" ]; then
  echo " MISSING: backend/.env not found."
  echo " Run: cp backend/.env.example backend/.env"
  echo " Then open backend/.env and set GROQ_API_KEY to your key from console.groq.com"
  exit 1
fi

# -- Check GROQ_API_KEY is not the placeholder --------------------------------
if grep -q "gsk_your_key_here" "backend/.env"; then
  echo " WARNING: backend/.env still has the placeholder GROQ_API_KEY."
  echo " Edit backend/.env and replace gsk_your_key_here with your real key."
  echo " Get one free at https://console.groq.com"
  echo ""
fi

# -- Check Ollama is installed and model is pulled ----------------------------
echo " Checking Ollama..."
if ! command -v ollama &>/dev/null; then
  echo ""
  echo " WARNING: Ollama is not installed or not in PATH."
  echo " SYNQ needs Ollama for local embeddings (RAG context search)."
  echo " Install from: https://ollama.com"
  echo " After installing, run: ollama pull nomic-embed-text"
  echo ""
  echo " Continuing without Ollama -- RAG features will be unavailable."
  echo ""
else
  # `ollama show` returns 0 if the model exists, non-zero if not.
  if ollama show nomic-embed-text >/dev/null 2>&1; then
    echo " Ollama + nomic-embed-text ready"
  else
    echo " Pulling nomic-embed-text model (one-time, ~270MB)..."
    if ollama pull nomic-embed-text; then
      echo " nomic-embed-text model ready"
    else
      echo " WARNING: Failed to pull nomic-embed-text model."
      echo " Make sure Ollama is running: ollama serve"
      echo " Then manually run: ollama pull nomic-embed-text"
      echo ""
    fi
  fi
fi
echo ""

# -- Start databases ----------------------------------------------------------
echo " Starting Docker containers (Neo4j + MongoDB + ChromaDB)..."
# Try modern `docker compose` (Docker Desktop v4+), fall back to legacy CLI.
if docker compose up -d 2>/dev/null; then
  echo " Databases running"
else
  echo " Retrying with legacy docker-compose..."
  if docker-compose up -d; then
    echo " Databases running"
  else
    echo " ERROR: Docker failed to start. Is Docker Desktop running?"
    exit 1
  fi
fi
echo ""

# -- Give DBs a moment to initialise -----------------------------------------
sleep 3

# -- Build extension with esbuild --------------------------------------------
echo " Building extension..."
cd extension
if [ ! -f "node_modules/.bin/esbuild" ]; then
  echo " Installing extension dependencies..."
  npm install --loglevel warn || { echo " ERROR: Extension dependency install failed."; cd ..; exit 1; }
fi

echo " Bundling content script..."
if npx esbuild src/content.ts --bundle --outfile=dist/content.js --format=iife --target=es2020; then
  echo " content.js OK"
else
  echo " WARNING: content.ts bundle failed."
fi

echo " Bundling background script..."
if npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020; then
  echo " background.js OK"
else
  echo " WARNING: background.ts bundle failed."
fi

echo " Bundling popup..."
if npx esbuild popup/popup.ts --bundle --outfile=popup/popup.js --format=iife --target=es2020; then
  echo " popup.js OK"
else
  echo " WARNING: popup.ts bundle failed."
fi

cd ..
echo ""

# -- Start backend in background ---------------------------------------------
echo " Starting backend on port 3001..."
cd backend
if [ ! -f "node_modules/.bin/ts-node-dev" ]; then
  echo " Installing backend dependencies..."
  npm install --loglevel warn || { echo " ERROR: Backend dependency install failed."; cd ..; exit 1; }
fi
npm run dev &
BACKEND_PID=$!
cd ..
echo " Backend started (PID $BACKEND_PID)"
echo ""

# -- Wait for backend to become healthy --------------------------------------
echo " Waiting for backend to start..."
HEALTH_OK=0
for i in $(seq 1 10); do
  sleep 2
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q "200"; then
    HEALTH_OK=1
    break
  fi
done

if [ "$HEALTH_OK" -eq 0 ]; then
  echo " WARNING: Backend health check timed out. Check terminal output for errors."
else
  echo " Backend is healthy"
fi
echo ""

# -- Start dashboard in background -------------------------------------------
echo " Starting dashboard on port 5173..."
cd dashboard
if [ ! -f "node_modules/.bin/vite" ]; then
  echo " Installing dashboard dependencies..."
  npm install --loglevel warn || { echo " ERROR: Dashboard dependency install failed."; cd ..; exit 1; }
fi
npm run dev &
DASHBOARD_PID=$!
cd ..
echo " Dashboard started (PID $DASHBOARD_PID)"
echo ""

echo "========================================="
echo " SYNQ is running"
echo "   Dashboard  >  http://localhost:5173"
echo "   Backend    >  http://localhost:3001/health"
echo "   Neo4j UI   >  http://localhost:7474"
echo "   ChromaDB   >  http://localhost:8000"
echo "   MongoDB    >  mongodb://localhost:27017"
echo "========================================="
echo ""
echo " Extension: load the /extension folder in chrome://extensions (Developer mode)"
echo " Press Ctrl+C to stop everything."
echo ""

# -- Trap Ctrl+C and kill children cleanly -----------------------------------
# Trap only INT and TERM (not EXIT) -- trapping EXIT causes the cleanup
# function to also run on normal script completion, stopping databases
# unexpectedly when nothing went wrong.
cleanup() {
  echo ""
  echo " Stopping SYNQ..."
  kill $BACKEND_PID $DASHBOARD_PID 2>/dev/null || true
  docker compose stop 2>/dev/null || docker-compose stop 2>/dev/null || true
  echo " Done."
}
trap cleanup INT TERM
wait