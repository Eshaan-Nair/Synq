@echo off
setlocal EnableDelayedExpansion

REM Always run from the script's own directory
cd /d "%~dp0"

set "COMPOSE_PROJECT_NAME=synq"

echo.
echo  ===================================
echo   SYNQ v1.4.0 - Installer
echo  ===================================
echo.

REM 1. Check Docker
where docker >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Docker not found. Install Docker Desktop first.
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

REM 2. Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js not found. Install v20 LTS.
  pause
  exit /b 1
)
echo  OK Node.js ready

REM 3. Check Ollama
where ollama >nul 2>&1
if errorlevel 1 (
  echo  WARN Ollama not found - RAG/Graph features will be disabled.
) else (
  echo  OK Ollama found
  echo  Pulling models...
  call ollama pull nomic-embed-text
  call ollama pull llama3.1:8b
)

REM 4. Setup .env
if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo  OK Created backend\.env
)

REM 5. Detect RAM - robust version
set "PROFILE=full"
set "RAM_GB=0"
set "RAM_KB="
for /f "tokens=2 delims==" %%a in ('wmic OS get TotalVisibleMemorySize /value 2^>nul') do (
    for /f "delims=" %%b in ("%%a") do set "RAM_KB=%%b"
)

if defined RAM_KB (
  set "RAM_KB=!RAM_KB: =!"
  echo !RAM_KB!| findstr /r "^[0-9]*$" >nul
  if !errorlevel! equ 0 (
    set /a RAM_GB=!RAM_KB! / 1048576
    if !RAM_GB! LSS 8 (
      set "PROFILE=lite"
      echo  WARN !RAM_GB! GB RAM - LITE mode enabled
    )
  )
)

if defined SYNQ_PROFILE set "PROFILE=%SYNQ_PROFILE%"

REM 6. Dependencies
echo  Installing dependencies...
cd backend && call npm install --loglevel error && cd ..
cd dashboard && call npm install --loglevel error && cd ..
cd extension && call npm install --loglevel error && cd ..

REM 7. Build
echo  Building...
cd dashboard && call npm run build && cd ..
cd extension
call npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020
call npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020
cd ..

REM 8. Start DBs
echo  Starting databases...
docker compose --profile %PROFILE% up -d
echo.
echo  ===================================
echo   SYNQ Installed Successfully
echo  ===================================
echo   Run start.bat to begin.
echo.
pause
