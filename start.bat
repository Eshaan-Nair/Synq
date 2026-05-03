@echo off
setlocal EnableDelayedExpansion

REM Always run from the script's own directory
cd /d "%~dp0"

set "COMPOSE_PROJECT_NAME=synq"

echo.
echo  ===================================
echo   SYNQ v1.4.0 - Starting up
echo  ===================================
echo.

REM Check .env exists
if not exist "backend\.env" (
  echo  ERROR: backend\.env not found.
  echo  Run: copy backend\.env.example backend\.env
  echo.
  pause
  exit /b 1
)

REM Check Docker
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
echo  Docker ready

REM Check Ollama
where ollama >nul 2>&1
if errorlevel 1 (
  echo  Ollama not found - limited features.
) else (
  echo  Ollama ready
)

REM Detect RAM - safe version
set "PROFILE=full"
set "RAM_GB=0"
set "RAM_KB="

for /f "tokens=2 delims==" %%a in ('wmic OS get TotalVisibleMemorySize /value 2^>nul') do (
    for /f "delims=" %%b in ("%%a") do set "RAM_KB=%%b"
)

if defined RAM_KB (
    set "RAM_KB=!RAM_KB: =!"
    REM Only do math if RAM_KB is just digits
    echo !RAM_KB!| findstr /r "^[0-9]*$" >nul
    if !errorlevel! equ 0 (
        set /a RAM_GB=!RAM_KB! / 1048576
        if !RAM_GB! LSS 8 (
            set "PROFILE=lite"
        )
    )
)

if defined SYNQ_PROFILE set "PROFILE=%SYNQ_PROFILE%"

if "!PROFILE!"=="lite" (
  echo  Starting in LITE mode
) else (
  echo  Starting in FULL mode
)
echo.

REM Start DBs
echo  Starting databases...
docker compose --profile %PROFILE% up -d
echo.

REM Build extension
echo  Building extension...
cd extension
if not exist "node_modules" call npm install --loglevel error
call npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020
call npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020
cd ..

REM Build dashboard
if not exist "dashboard\dist" (
    echo  Building dashboard...
    cd dashboard
    if not exist "node_modules" call npm install --loglevel error
    call npm run build
    cd ..
)

echo.
echo  Starting backend...
cd backend
if not exist "node_modules" call npm install --loglevel error
start "SYNQ Backend" cmd /k "npm run dev"
cd ..

echo.
echo  SYNQ is running!
echo  Dashboard: http://localhost:3001
echo.
pause
