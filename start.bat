@echo off
echo.
echo  Starting SYNQ...
echo.

REM ── Check .env exists ─────────────────────────────────────────────
if not exist "backend\.env" (
  echo  MISSING: backend\.env not found.
  echo  Run: copy backend\.env.example backend\.env
  echo  Then open backend\.env and set GROQ_API_KEY to your key from console.groq.com
  pause
  exit /b 1
)

REM ── Check GROQ_API_KEY is not the placeholder ──────────────────────
findstr /C:"gsk_your_key_here" "backend\.env" >nul 2>&1
if %errorlevel%==0 (
  echo  WARNING: backend\.env still has the placeholder GROQ_API_KEY.
  echo  Edit backend\.env and replace gsk_your_key_here with your real key.
  echo  Get one free at https://console.groq.com
  echo.
  pause
)

REM ── Check Ollama is installed and model is pulled ──────────────────
echo  Checking Ollama...
where ollama >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  WARNING: Ollama is not installed or not in PATH.
  echo  SYNQ needs Ollama for local embeddings ^(RAG context search^).
  echo  Install from: https://ollama.com
  echo  After installing, run: ollama pull nomic-embed-text
  echo.
  echo  Continuing without Ollama — RAG features will be unavailable.
  echo.
) else (
  REM Check if nomic-embed-text model is available
  ollama show nomic-embed-text >nul 2>&1
  if %errorlevel% neq 0 (
    echo  Pulling nomic-embed-text model ^(one-time, ~270MB^)...
    call ollama pull nomic-embed-text
    if %errorlevel% neq 0 (
      echo  WARNING: Failed to pull nomic-embed-text model.
      echo  Make sure Ollama is running: ollama serve
      echo  Then manually run: ollama pull nomic-embed-text
      echo.
    ) else (
      echo  nomic-embed-text model ready
    )
  ) else (
    echo  Ollama + nomic-embed-text ready
  )
)
echo.

REM ── Start Docker databases ─────────────────────────────────────────
echo  Starting Docker containers (Neo4j + MongoDB + ChromaDB)...
docker-compose up -d
if %errorlevel% neq 0 (
  echo  Docker failed to start. Is Docker Desktop running?
  echo  Enable WSL2 if on Windows: https://docs.microsoft.com/en-us/windows/wsl/install
  pause
  exit /b 1
)
echo  Databases running
echo.

REM ── Give DBs a moment to initialise ───────────────────────────────
timeout /t 3 /nobreak >nul

REM ── Build extension with esbuild ──────────────────────────────────
echo  Building extension...
cd extension

if not exist "node_modules" (
  echo  Installing extension dependencies...
  call npm install --loglevel warn
  if %errorlevel% neq 0 (
    echo  ERROR: Extension dependency install failed.
    echo  Check the error above and try: cd extension ^&^& npm install
    cd ..
    pause
    exit /b 1
  )
)

echo  Bundling content script...
call npx esbuild src/content.ts --bundle --outfile=dist/content.js --format=iife --target=es2020
if %errorlevel% neq 0 (
  echo  WARNING: content.ts bundle failed.
) else (
  echo  content.js OK
)

echo  Bundling background script...
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020
if %errorlevel% neq 0 (
  echo  WARNING: background.ts bundle failed.
) else (
  echo  background.js OK
)

echo  Bundling popup...
call npx esbuild popup/popup.ts --bundle --outfile=popup/popup.js --format=iife --target=es2020
if %errorlevel% neq 0 (
  echo  WARNING: popup.ts bundle failed.
) else (
  echo  popup.js OK
)

cd ..
echo.

REM ── Start backend ─────────────────────────────────────────────────
echo  Starting backend on port 3001...
cd backend

if not exist "node_modules" (
  echo  Installing backend dependencies...
  call npm install --loglevel warn
  if %errorlevel% neq 0 (
    echo  ERROR: Backend dependency install failed.
    echo  Check the error above and try: cd backend ^&^& npm install
    cd ..
    pause
    exit /b 1
  )
  echo  Backend dependencies installed
)

start "SYNQ Backend" cmd /k "npm run dev"
cd ..
echo  Backend window opened
echo.

REM ── Wait for backend to become healthy ─────────────────────────────
echo  Waiting for backend to start...
timeout /t 4 /nobreak >nul
REM Try a simple health check (curl may not be available on all Windows PCs)
where curl >nul 2>&1
if %errorlevel%==0 (
  curl -s http://localhost:3001/health >nul 2>&1
  if %errorlevel%==0 (
    echo  Backend is healthy
  ) else (
    echo  WARNING: Backend health check failed. Check the backend window for errors.
  )
) else (
  echo  Backend should be starting ^(install curl to enable health checks^)
)
echo.

REM ── Start dashboard ────────────────────────────────────────────────
echo  Starting dashboard on port 5173...
cd dashboard

if not exist "node_modules" (
  echo  Installing dashboard dependencies...
  call npm install --loglevel warn
  if %errorlevel% neq 0 (
    echo  ERROR: Dashboard dependency install failed.
    echo  Check the error above and try: cd dashboard ^&^& npm install
    cd ..
    pause
    exit /b 1
  )
  echo  Dashboard dependencies installed
)

start "SYNQ Dashboard" cmd /k "npm run dev"
cd ..
echo  Dashboard window opened
echo.

echo =========================================
echo  SYNQ is running
echo    Dashboard  ^>  http://localhost:5173
echo    Backend    ^>  http://localhost:3001/health
echo    Neo4j UI   ^>  http://localhost:7474
echo    ChromaDB   ^>  http://localhost:8000
echo =========================================
echo.
echo  Extension: load the /extension folder in chrome://extensions (Developer mode)
echo  Close the backend and dashboard windows to stop.
echo  To stop databases: docker-compose stop
echo.
pause
