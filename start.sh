#!/bin/bash
set -e

echo ""
echo " Starting SYNQ..."
echo ""

# ── Check .env exists ──────────────────────────────────────────────
if [ ! -f "backend/.env" ]; then
  echo " MISSING: backend/.env not found."
  echo " Run: cp backend/.env.example backend/.env"
  echo " Then open backend/.env and set GROQ_API_KEY to your key from console.groq.com"
  exit 1
fi

# ── Check GROQ_API_KEY is not the placeholder ──────────────────────
if grep -q "gsk_your_key_here" "backend/.env"; then
  echo " WARNING: backend/.env still has the placeholder GROQ_API_KEY."
  echo " Edit backend/.env and replace gsk_your_key_here with your real key."
  echo " Get one free at https://console.groq.com"
  echo ""
fi

# ── Start databases ────────────────────────────────────────────────
echo " Starting Docker containers (Neo4j + MongoDB + ChromaDB)..."
docker-compose up -d
echo " Databases running"
echo ""

# ── Give DBs a moment to initialise ───────────────────────────────
sleep 3

# ── Build extension with esbuild ──────────────────────────────────
echo " Building extension..."
cd extension
if [ ! -d "node_modules" ]; then
  echo " Installing extension dependencies..."
  npm install --silent
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

# ── Start backend in background ───────────────────────────────────
echo " Starting backend on port 3001..."
cd backend
# #15: Only install if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo " Installing backend dependencies..."
  npm install --silent
fi
npm run dev &
BACKEND_PID=$!
cd ..
echo " Backend started (PID $BACKEND_PID)"
echo ""

# ── Wait briefly so backend can connect before dashboard starts ───
sleep 2

# ── Start dashboard in background ─────────────────────────────────
echo " Starting dashboard on port 5173..."
cd dashboard
# #15: Only install if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo " Installing dashboard dependencies..."
  npm install --silent
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
echo "========================================="
echo ""
echo " Extension: load the /extension folder in chrome://extensions (Developer mode)"
echo " Press Ctrl+C to stop everything."
echo ""

# ── Trap Ctrl+C and kill children cleanly ─────────────────────────
cleanup() {
  echo ""
  echo " Stopping SYNQ..."
  kill $BACKEND_PID $DASHBOARD_PID 2>/dev/null || true
  docker-compose stop
  echo " Done."
}
trap cleanup EXIT INT TERM
wait
