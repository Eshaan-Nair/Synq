@echo off
setlocal EnableDelayedExpansion

REM Always run from the script's own directory
cd /d "%~dp0"

set "COMPOSE_PROJECT_NAME=glia"

echo.
echo  ===================================
echo   GLIA v1.5.1 - Starting up
echo  ===================================
echo.

REM 1. Load .env settings
if not exist "backend\.env" (
  echo  ERROR: backend\.env not found. Run install.bat first.
  pause
  exit /b 1
)

set "GLIA_STORAGE_MODE=docker"
for /f "tokens=1,2 delims==" %%a in (backend\.env) do (
    if "%%a"=="GRAPH_BACKEND" set "GRAPH_BACKEND=%%b"
    if "%%a"=="OLLAMA_MODEL" set "OLLAMA_MODEL=%%b"
    if "%%a"=="GLIA_STORAGE_MODE" set "GLIA_STORAGE_MODE=%%b"
)
if "!GRAPH_BACKEND!"=="" set "GRAPH_BACKEND=ollama"

set "USE_SQLITE=0"
if "!GLIA_STORAGE_MODE!"=="sqlite" set "USE_SQLITE=1"

REM 2. Check Docker (skip if SQLite)

if "!USE_SQLITE!"=="0" (
  where docker >nul 2>&1
  if errorlevel 1 (
    echo  ERROR: Docker not found. Defaulting to SQLite? Or set GLIA_STORAGE_MODE=sqlite in .env
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
) else (
  echo  OK Mode: Zero-Docker ^(SQLite^)
)

REM 3. Check Backend Status
if "!GRAPH_BACKEND!"=="groq" (
    echo  OK Knowledge Graph: Groq ^(Cloud API^)
) else (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo  WARN Ollama not found - Graph extraction will fail.
    ) else (
        echo  OK Knowledge Graph: Ollama ^(Local: !OLLAMA_MODEL!^)
    )
)

REM 4. Detect RAM (PowerShell for large number support)
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1MB)"') do set "RAM_GB=%%a"

set "PROFILE=full"
if !RAM_GB! LSS 8 (
    set "PROFILE=lite"
    echo  OK Mode: LITE ^(!RAM_GB! GB RAM detected^)
) else (
    echo  OK Mode: FULL ^(!RAM_GB! GB RAM detected^)
)
echo.

REM 5. Start DBs
if "!USE_SQLITE!"=="0" (
    echo  Starting databases...
    docker compose --profile %PROFILE% up -d
) else (
    echo  Skipping Docker Compose ^(SQLite mode active^).
)
echo.


REM 7. Build components (Ensure UI is always up-to-date)
echo  Building Dashboard...
pushd dashboard
call npm run build
popd

echo  Building extension...
pushd extension
call npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020 --log-level=error
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 --log-level=error
call npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020 --log-level=error
popd

REM 7. Start backend
echo.
echo  ===================================
echo   GLIA is running!
echo  ===================================
echo.
for /f "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set "ESC=%%b"
echo   Dashboard ^-^> !ESC![1;96mhttp://localhost:3001!ESC![0m
echo.
cd backend
npm run dev
