@echo off
setlocal EnableDelayedExpansion

REM Always run from the script's own directory
cd /d "%~dp0"

set "COMPOSE_PROJECT_NAME=synq"

echo.
echo  ===================================
echo   SYNQ v1.4.1 - Smart Installer
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

REM 3. Detect System Resources (using PowerShell for large number support)
echo.
echo  Detecting system hardware...

for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1MB)"') do set "RAM_GB=%%a"
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "$vram = (Get-CimInstance Win32_VideoController | Measure-Object -Property AdapterRAM -Sum).Sum; if ($vram -lt 0) { $vram = 4GB }; [math]::Round($vram / 1GB)"') do set "VRAM_GB=%%a"

echo  -----------------------------------
echo   RAM:  !RAM_GB! GB
echo   VRAM: !VRAM_GB! GB
echo  -----------------------------------
echo.

REM 4. Backend Selection
echo  Select your Knowledge Graph backend:
echo  [1] Groq API - Cloud (Recommended for Fast/Low-end PCs)
echo  [2] Ollama   - Local (Recommended for High-end/Privacy)
echo.
set /p BACKEND_CHOICE="Enter choice [1-2] (default 1): "
if "!BACKEND_CHOICE!"=="" set "BACKEND_CHOICE=1"

if "!BACKEND_CHOICE!"=="2" goto OLLAMA_SETUP

:GROQ_SETUP
set "GRAPH_BACKEND=groq"
set "SELECTED_MODEL=llama3.1:8b"
echo.
echo  Groq selected. Backend will use Cloud API.
goto POST_BACKEND

:OLLAMA_SETUP
set "GRAPH_BACKEND=ollama"
echo.
echo  Select Ollama Model for your !VRAM_GB!GB VRAM:
echo  [1] Llama 3.1 8b   - 8GB VRAM (Best Accuracy)
echo  [2] Mistral 7b     - 6GB VRAM (Balanced)
echo  [3] Phi-3.5 Mini   - 4GB VRAM (Lightweight)
echo  [4] Qwen 2.5 1.5b  - 2GB VRAM (Ultra Fast)
echo.
set /p MODEL_CHOICE="Enter choice [1-4] (default 1): "
set "SELECTED_MODEL=llama3.1:8b"
if "!MODEL_CHOICE!"=="2" set "SELECTED_MODEL=mistral:7b"
if "!MODEL_CHOICE!"=="3" set "SELECTED_MODEL=phi3.5:3.8b"
if "!MODEL_CHOICE!"=="4" set "SELECTED_MODEL=qwen2.5:1.5b"

echo.
echo  Pulling Ollama models: !SELECTED_MODEL! + embeddings...
where ollama >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Ollama not found in PATH. Install from ollama.com first.
    pause
    exit /b 1
)
call ollama pull nomic-embed-text
call ollama pull !SELECTED_MODEL!
goto POST_BACKEND

:POST_BACKEND
REM 5. Setup .env
if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
)

REM Update .env with choices (PowerShell safe method)
powershell -NoProfile -Command "$c = Get-Content backend\.env; if ($c -match 'GRAPH_BACKEND=') { $c = $c -replace 'GRAPH_BACKEND=.*', 'GRAPH_BACKEND=!GRAPH_BACKEND!' } else { $c += 'GRAPH_BACKEND=!GRAPH_BACKEND!' }; if ($c -match 'OLLAMA_MODEL=') { $c = $c -replace 'OLLAMA_MODEL=.*', 'OLLAMA_MODEL=!SELECTED_MODEL!' } else { $c += 'OLLAMA_MODEL=!SELECTED_MODEL!' }; $c | Set-Content backend\.env -Encoding UTF8"

REM 6. Dependencies
echo.
echo  Installing dependencies...
cd backend && call npm install --loglevel error && cd ..
cd dashboard && call npm install --loglevel error && cd ..
cd extension && call npm install --loglevel error && cd ..

REM 7. Build
echo.
echo  Building components...
cd dashboard && call npm run build && cd ..
cd extension
call npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020 --log-level=error
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 --log-level=error
call npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020 --log-level=error
cd ..

REM 8. Start DBs
set "PROFILE=full"
if !RAM_GB! LSS 8 set "PROFILE=lite"
echo.
echo  Starting databases: Profile !PROFILE!...
docker compose --profile %PROFILE% up -d

echo.
echo  ===================================
echo   SYNQ Installed Successfully
echo  ===================================
if "!GRAPH_BACKEND!"=="groq" (
    echo   IMPORTANT: Ensure GROQ_API_KEY is set in backend/.env
)
echo   Run start.bat to begin.
echo.
pause
