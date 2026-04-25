#!/bin/bash
set -e

echo ""
echo "⚡ Starting SYNQ..."
echo ""

# 1. Start databases
echo "▶ Starting Docker containers (Neo4j + MongoDB)..."
docker-compose up -d
echo "✅ Databases running"
echo ""

# 2. Start backend in background
echo "▶ Starting backend on port 3001..."
cd backend
if [ ! -f ".env" ]; then
  echo "❌ Missing backend/.env — run: cp backend/.env.example backend/.env and add your GROQ_API_KEY"
  exit 1
fi
npm install --silent
npm run dev &
BACKEND_PID=$!
cd ..
echo "✅ Backend started (PID $BACKEND_PID)"
echo ""

# 3. Wait briefly so backend can connect to DBs before dashboard starts
sleep 2

# 4. Start dashboard in background
echo "▶ Starting dashboard on port 5173..."
cd dashboard
npm install --silent
npm run dev &
DASHBOARD_PID=$!
cd ..
echo "✅ Dashboard started (PID $DASHBOARD_PID)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ SYNQ is running"
echo "   Dashboard → http://localhost:5173"
echo "   Backend   → http://localhost:3001"
echo "   Neo4j UI  → http://localhost:7474"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

# Keep alive and kill children on exit
trap "echo ''; echo 'Stopping SYNQ...'; kill $BACKEND_PID $DASHBOARD_PID 2>/dev/null; docker-compose stop; echo 'Done.'" EXIT
wait
