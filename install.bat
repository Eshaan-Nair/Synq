@echo off
setlocal EnableDelayedExpansion

REM Always run from the script's own directory
cd /d "%~dp0"

set "COMPOSE_PROJECT_NAME=glia"

echo.
echo  ===================================
echo   GLIA v1.5.2 - Smart Installer
echo  ===================================
echo.

REM 1. Check Docker
set "USE_SQLITE=0"
where docker >nul 2>&1
if errorlevel 1 (
  echo  WARNING: Docker not found. Defaulting to Zero-Docker ^(SQLite^) mode.
  set "USE_SQLITE=1"
) else (
  docker info >nul 2>&1
  if errorlevel 1 (
    echo  WARNING: Docker Desktop is not running. Defaulting to Zero-Docker ^(SQLite^) mode.
    set "USE_SQLITE=1"
  ) else (
    echo  OK Docker ready
  )
)

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
echo  -----------------------------------
echo   [RECOMMENDED] Use Ollama (Local) if:
echo   - You have long chats (100k+ chars)
echo   - You use offline tools (Claude Code, Windsurf)
echo   - You want 100%% privacy (Local-only)
echo  -----------------------------------
echo.
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
set /p GROQ_API_KEY="Enter your Groq API Key (get it at console.groq.com): "
goto POST_BACKEND

:OLLAMA_SETUP
set "GRAPH_BACKEND=ollama"
echo.
echo  Ollama selected. Backend will use Local-first RAG.
set /p GROQ_API_KEY="Enter your Groq API Key for fallback (optional, press Enter to skip): "
echo.
echo  Select Ollama Model for your !VRAM_GB!GB VRAM:
echo  [1] Qwen 2.5 1.5b  - 2GB VRAM (Ultra Fast)
echo  [2] Phi-3.5 Mini   - 4GB VRAM (Lightweight)
echo  [3] Mistral 7b     - 6GB VRAM (Reliable Mid-Level)
echo  [4] Llama 3.1 8b   - 8GB VRAM (Standard / Balanced)
echo  [5] Qwen 2.5 32b   - 20GB VRAM (Mid-High Excellence)
echo  [6] Llama 3.3 70b  - 40GB VRAM (High-End Powerhouse)
echo.
set /p MODEL_CHOICE="Enter choice [1-6] (default 4): "
set "SELECTED_MODEL=llama3.1:8b"
if "!MODEL_CHOICE!"=="1" set "SELECTED_MODEL=qwen2.5:1.5b"
if "!MODEL_CHOICE!"=="2" set "SELECTED_MODEL=phi3.5:3.8b"
if "!MODEL_CHOICE!"=="3" set "SELECTED_MODEL=mistral:7b"
if "!MODEL_CHOICE!"=="4" set "SELECTED_MODEL=llama3.1:8b"
if "!MODEL_CHOICE!"=="5" set "SELECTED_MODEL=qwen2.5:32b"
if "!MODEL_CHOICE!"=="6" set "SELECTED_MODEL=llama3.3:70b"

set OLLAMA_CMD=ollama
where ollama >nul 2>&1
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set "OLLAMA_CMD=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    echo  OK Ollama found at %LOCALAPPDATA%\Programs\Ollama\
  ) else (
    echo  ERROR: Ollama not found. Opening download page...
    start https://ollama.com/download/windows
    echo  Please install Ollama, then re-run install.bat
    pause
    exit /b 1
  )
)

echo.
echo  Pulling Ollama models: !SELECTED_MODEL! + embeddings...
call !OLLAMA_CMD! pull nomic-embed-text
call !OLLAMA_CMD! pull !SELECTED_MODEL!
goto POST_BACKEND

:POST_BACKEND
REM 5. Setup .env
if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
)
if not exist "dashboard\.env" (
  copy "dashboard\.env.example" "dashboard\.env" >nul
)

REM Update .env with choices (PowerShell safe method)
powershell -NoProfile -Command "$utf8 = New-Object System.Text.UTF8Encoding($false); $c = Get-Content backend\.env; if ($c -match 'GRAPH_BACKEND=') { $c = $c -replace 'GRAPH_BACKEND=.*', 'GRAPH_BACKEND=!GRAPH_BACKEND!' } else { $c += 'GRAPH_BACKEND=!GRAPH_BACKEND!' }; if ($c -match 'OLLAMA_MODEL=') { $c = $c -replace 'OLLAMA_MODEL=.*', 'OLLAMA_MODEL=!SELECTED_MODEL!' } else { $c += 'OLLAMA_MODEL=!SELECTED_MODEL!' }; if ('!GROQ_API_KEY!' -ne '') { if ($c -match 'GROQ_API_KEY=') { $c = $c -replace 'GROQ_API_KEY=.*', 'GROQ_API_KEY=!GROQ_API_KEY!' } else { $c += 'GROQ_API_KEY=!GROQ_API_KEY!' } }; if ('!USE_SQLITE!' -eq '1') { if ($c -match 'GLIA_STORAGE_MODE=') { $c = $c -replace 'GLIA_STORAGE_MODE=.*', 'GLIA_STORAGE_MODE=sqlite' } else { $c += 'GLIA_STORAGE_MODE=sqlite' } }; [System.IO.File]::WriteAllLines('backend\.env', $c, $utf8);"

REM 6. Dependencies
echo.
echo  Installing dependencies...
pushd backend && call npm install --loglevel error && popd
pushd dashboard && call npm install --loglevel error && popd
pushd extension && call npm install --loglevel error && popd

REM 7. Build
echo.
echo  Building components...
pushd backend && call npm run build && popd
pushd dashboard && call npm run build && popd
pushd extension
call npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020 --log-level=error
call npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 --log-level=error
call npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020 --log-level=error
popd

REM 8. MCP Auto-Setup
echo.
echo  -----------------------------------
echo   MCP Server Setup
echo  -----------------------------------
echo   Glia can act as a memory layer for Claude Desktop, Cursor, and Windsurf.
set /p MCP_CHOICE="Would you like to automatically configure Claude Desktop? [y/n] (default n): "
if /i "!MCP_CHOICE!"=="y" (
  pushd backend && call npm run mcp:setup && popd
)

REM 9. Start DBs (only if using Docker)
if "!USE_SQLITE!"=="0" (
  set "PROFILE=full"
  if !RAM_GB! LSS 8 set "PROFILE=lite"
  echo.
  echo  Starting databases: Profile !PROFILE!...
  docker compose --profile %PROFILE% up -d
) else (
  echo.
  echo  Skipping Docker Compose ^(SQLite mode active^).
)

echo.
echo  ===================================
echo   GLIA Installed Successfully
echo  ===================================
if "!GRAPH_BACKEND!"=="groq" (
    echo   IMPORTANT: Ensure GROQ_API_KEY is set in backend/.env
)
echo   Run start.bat to begin.
echo.
echo  -----------------------------------
echo   FINAL STEP: LOAD THE EXTENSION
echo  -----------------------------------
echo   1. Open Chrome --^> chrome://extensions
echo   2. Enable Developer mode (top-right toggle)
echo   3. Load unpacked --^> select Glia-AI/extension/dist
echo   4. The GLIA badge appears on Claude, ChatGPT, Gemini, and DeepSeek
echo.
echo   All set! Your AI now has a memory.
echo.
pause
