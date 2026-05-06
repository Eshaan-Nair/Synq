@echo off
setlocal EnableDelayedExpansion

REM Always run from the script's own directory
cd /d "%~dp0"

set "COMPOSE_PROJECT_NAME=synq"

echo.
echo  ===================================
echo   SYNQ v1.4.1 - Starting up
echo  ===================================
echo.

REM 1. Load .env settings
if not exist "backend\.env" (
  echo  ERROR: backend\.env not found. Run install.bat first.
  pause
  exit /b 1
)

for /f "tokens=1,2 delims==" %%a in (backend\.env) do (
    if "%%a"=="GRAPH_BACKEND" set "GRAPH_BACKEND=%%b"
    if "%%a"=="OLLAMA_MODEL" set "OLLAMA_MODEL=%%b"
)
if "!GRAPH_BACKEND!"=="" set "GRAPH_BACKEND=ollama"

REM 2. Check Docker

where docker >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Docker not found.
  pause
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Docker Desktop is not running.
  pause
  exit /b 1
)
echo  OK Docker ready

REM 3. Check Backend Status
if "!GRAPH_BACKEND!"=="groq" (
    echo  OK Knowledge Graph: Groq (Cloud API)
) else (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo  WARN Ollama not found - Graph extraction will fail.
    ) else (
        echo  OK Knowledge Graph: Ollama (Local: !OLLAMA_MODEL!)
    )
)

REM 4. Detect RAM (PowerShell for large number support)
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1MB)"') do set "RAM_GB=%%a"

set "PROFILE=full"
if !RAM_GB! LSS 8 (
    set "PROFILE=lite"
    echo  OK Mode: LITE (!RAM_GB! GB RAM detected)
) else (
    echo  OK Mode: FULL (!RAM_GB! GB RAM detected)
)
echo.

REM 5. Start DBs
echo  Starting databases...
docker compose --profile %PROFILE% up -d
echo.

REM 6. Security Check
findstr /C:"SYNQ_SECRET=" backend\.env >nul
if errorlevel 1 (
    echo  WARN SYNQ_SECRET not found in .env. API will be unauthorized.
)

REM 7. Build components (Ensure UI is always up-to-date)
echo  Building Dashboard...
cd dashboard && call npm run build && cd ..

echo  Building extension...
cd extension
call npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020 --log-level=error
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 --log-level=error
call npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020 --log-level=error
cd ..

REM 7. Start backend
echo.
echo  Starting backend...
cd backend
start "SYNQ Backend" cmd /k "npm run dev"
cd ..

echo.
echo  ===================================
echo   SYNQ is running!
echo  ===================================
echo   Dashboard: http://localhost:3001
echo.
pause
