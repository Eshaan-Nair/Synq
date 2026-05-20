#!/bin/bash

# GLIA v1.5.2 - Startup Script (Linux/macOS)
# ------------------------------------------

set -e

echo ""
echo " ==================================="
echo "  GLIA v1.5.2 - Starting up"
echo " ==================================="
echo ""

# 1. Load .env settings
if [ ! -f "backend/.env" ]; then
    echo " ERROR: backend/.env not found. Run ./install.sh first."
    exit 1
fi

GRAPH_BACKEND=$(grep "GRAPH_BACKEND=" backend/.env | cut -d'=' -f2 | tr -d '\r')
OLLAMA_MODEL=$(grep "OLLAMA_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '\r')
GLIA_STORAGE_MODE=$(grep "GLIA_STORAGE_MODE=" backend/.env | cut -d'=' -f2 | tr -d '\r')
GRAPH_BACKEND=${GRAPH_BACKEND:-ollama}

USE_SQLITE=0
if [ "$GLIA_STORAGE_MODE" == "sqlite" ]; then USE_SQLITE=1; fi

# 2. Check Dependencies (skip Docker if SQLite)
if [ "$USE_SQLITE" == "0" ]; then
    if ! command -v docker &> /dev/null; then
        echo " ERROR: Docker not found. Use Zero-Docker mode by setting GLIA_STORAGE_MODE=sqlite in .env"
        exit 1
    fi
    echo " OK Docker ready"
else
    echo " OK Mode: Zero-Docker (SQLite)"
fi

# 3. Check Backend Status
if [ "$GRAPH_BACKEND" == "groq" ]; then
    echo " OK Knowledge Graph: Groq (Cloud API)"
else
    if command -v ollama &> /dev/null; then
        echo " OK Knowledge Graph: Ollama (Local: ${OLLAMA_MODEL})"
    else
        echo " WARN Ollama not found - Graph extraction will fail."
    fi
fi

# 4. Detect RAM
OS_TYPE=$(uname)
RAM_GB=0
if [ "$OS_TYPE" == "Darwin" ]; then
    RAM_BYTES=$(sysctl -n hw.memsize)
    RAM_GB=$((RAM_BYTES / 1024 / 1024 / 1024))
else
    RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
fi

PROFILE="full"
if [ "$RAM_GB" -lt 8 ]; then
    PROFILE="lite"
    echo " OK Mode: LITE (${RAM_GB} GB RAM detected)"
else
    echo " OK Mode: FULL (${RAM_GB} GB RAM detected)"
fi

# 5. Start DBs
if [ "$USE_SQLITE" == "0" ]; then
    echo ""
    echo " Starting databases..."
    docker compose --profile $PROFILE up -d
else
    echo ""
    echo " Skipping Docker Compose (SQLite mode active)."
fi

# 6. Build Check

if [ ! -d "dashboard/dist" ]; then
    echo " Dashboard build missing. Building..."
    (cd dashboard && npm run build)
fi

echo ""
echo " Building extension..."
(cd extension && npx esbuild src/content.ts --bundle --outfile=dist/content.js --format=iife --target=es2020 --log-level=error)
(cd extension && npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 --log-level=error)
(cd extension && npx esbuild popup/popup.ts --bundle --outfile=popup/popup.js --format=iife --target=es2020 --log-level=error)

# 7. Start Backend
echo ""
echo " ==================================="
echo "  GLIA is running!"
echo " ==================================="
echo "  Dashboard -> \033[1;96mhttp://localhost:3001\033[0m"
echo ""
(cd backend && npm run dev)
