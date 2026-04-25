@echo off
echo.
echo ⚡ Starting SYNQ...
echo.

echo ▶ Starting Docker containers (Neo4j + MongoDB)...
docker-compose up -d
echo ✅ Databases running
echo.

if not exist "backend\.env" (
  echo ❌ Missing backend\.env — run: copy backend\.env.example backend\.env and add your GROQ_API_KEY
  exit /b 1
)

echo ▶ Starting backend on port 3001...
cd backend
start "SYNQ Backend" cmd /k "npm install --silent && npm run dev"
cd ..
echo ✅ Backend window opened
echo.

timeout /t 2 /nobreak >nul

echo ▶ Starting dashboard on port 5173...
cd dashboard
start "SYNQ Dashboard" cmd /k "npm install --silent && npm run dev"
cd ..
echo ✅ Dashboard window opened
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ⚡ SYNQ is running
echo    Dashboard → http://localhost:5173
echo    Backend   → http://localhost:3001
echo    Neo4j UI  → http://localhost:7474
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo Close the backend and dashboard windows to stop.
pause
