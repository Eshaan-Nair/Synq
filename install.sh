#!/bin/bash

# SYNQ v1.4.1 - Smart Installer (Linux/macOS)
# -------------------------------------------

set -e

echo ""
echo " ==================================="
echo "  SYNQ v1.4.1 - Smart Installer"
echo " ==================================="
echo ""

# 1. Check Dependencies
if ! command -v docker &> /dev/null; then
    echo " ERROR: Docker not found. Install Docker first."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo " ERROR: Node.js not found. Install v20 LTS."
    exit 1
fi
echo " OK Docker & Node.js ready"

# 2. Detect System Resources
echo ""
echo " Detecting system hardware..."

OS_TYPE=$(uname)
RAM_GB=0
VRAM_GB=0

if [ "$OS_TYPE" == "Darwin" ]; then
    # macOS RAM
    RAM_BYTES=$(sysctl -n hw.memsize)
    RAM_GB=$((RAM_BYTES / 1024 / 1024 / 1024))
    # macOS VRAM (Apple Silicon or Intel)
    VRAM_GB=$(system_profiler SPDisplaysDataType | grep "VRAM" | head -1 | awk '{print $4}' || echo "0")
    if [[ "$VRAM_GB" == "0" ]]; then
        # On Apple Silicon, unified memory is often reported as 0 by system_profiler
        # We can assume a portion of RAM is available for GPU
        VRAM_GB=$((RAM_GB / 2))
    fi
else
    # Linux RAM
    RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
    # Linux VRAM (NVIDIA)
    if command -v nvidia-smi &> /dev/null; then
        VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
        VRAM_GB=$((VRAM_MB / 1024))
    fi
fi

echo " -----------------------------------"
echo "  RAM:  ${RAM_GB} GB"
echo "  VRAM: ${VRAM_GB} GB (estimated)"
echo " -----------------------------------"
echo ""

# 3. Backend Selection
echo " Select your Knowledge Graph backend:"
echo " [1] Groq API - Cloud (Recommended for Fast/Low-end PCs)"
echo " [2] Ollama   - Local (Recommended for High-end/Privacy)"
echo ""
read -p " Enter choice [1-2] (default 1): " BACKEND_CHOICE
BACKEND_CHOICE=${BACKEND_CHOICE:-1}

GRAPH_BACKEND="groq"
SELECTED_MODEL="llama3.1:8b"

if [ "$BACKEND_CHOICE" == "2" ]; then
    GRAPH_BACKEND="ollama"
    echo ""
    echo " Select Ollama Model (based on your ${VRAM_GB}GB VRAM):"
    echo " [1] Llama 3.1 8b   - 8GB VRAM (Best Accuracy)"
    echo " [2] Mistral 7b     - 6GB VRAM (Balanced)"
    echo " [3] Phi-3.5 Mini   - 4GB VRAM (Lightweight)"
    echo " [4] Qwen 2.5 1.5b  - 2GB VRAM (Ultra Fast)"
    echo ""
    read -p " Enter choice [1-4] (default 1): " MODEL_CHOICE
    case $MODEL_CHOICE in
        2) SELECTED_MODEL="mistral:7b" ;;
        3) SELECTED_MODEL="phi3.5:3.8b" ;;
        4) SELECTED_MODEL="qwen2.5:1.5b" ;;
        *) SELECTED_MODEL="llama3.1:8b" ;;
    esac

    echo ""
    echo " Pulling Ollama models: ${SELECTED_MODEL} + embeddings..."
    if ! command -v ollama &> /dev/null; then
        echo " ERROR: Ollama not found. Install from ollama.com first."
        exit 1
    fi
    ollama pull nomic-embed-text
    ollama pull $SELECTED_MODEL
else
    echo ""
    echo " Groq selected. Backend will use Cloud API."
fi

# 4. Setup .env
if [ ! -f "backend/.env" ]; then
    cp "backend/.env.example" "backend/.env"
fi

# Update .env (portable sed)
if [[ "$OS_TYPE" == "Darwin" ]]; then
    sed -i '' "s/GRAPH_BACKEND=.*/GRAPH_BACKEND=$GRAPH_BACKEND/" backend/.env
    sed -i '' "s/OLLAMA_MODEL=.*/OLLAMA_MODEL=$SELECTED_MODEL/" backend/.env
else
    sed -i "s/GRAPH_BACKEND=.*/GRAPH_BACKEND=$GRAPH_BACKEND/" backend/.env
    sed -i "s/OLLAMA_MODEL=.*/OLLAMA_MODEL=$SELECTED_MODEL/" backend/.env
fi

# Ensure lines exist if not in example
grep -q "GRAPH_BACKEND=" backend/.env || echo "GRAPH_BACKEND=$GRAPH_BACKEND" >> backend/.env
grep -q "OLLAMA_MODEL=" backend/.env || echo "OLLAMA_MODEL=$SELECTED_MODEL" >> backend/.env

# v1.4.1+: Auto-generate secret if missing
if ! grep -q "^SYNQ_SECRET=." backend/.env; then
  if command -v openssl &> /dev/null; then
    NEW_SECRET=$(openssl rand -base64 32)
    if grep -q "^SYNQ_SECRET=" backend/.env; then
      if [[ "$OS_TYPE" == "Darwin" ]]; then
        sed -i '' "s|^SYNQ_SECRET=.*|SYNQ_SECRET=$NEW_SECRET|" backend/.env
      else
        sed -i "s|^SYNQ_SECRET=.*|SYNQ_SECRET=$NEW_SECRET|" backend/.env
      fi
    else
      echo "SYNQ_SECRET=$NEW_SECRET" >> backend/.env
    fi
    echo " OK Generated random SYNQ_SECRET"
  else
    echo " WARNING: openssl not found. Could not generate SYNQ_SECRET."
  fi
fi

# Sync secret to dashboard
BACKEND_SECRET=$(grep "^SYNQ_SECRET=" backend/.env | cut -d'=' -f2-)
if [ -n "$BACKEND_SECRET" ]; then
  if grep -q "VITE_SYNQ_SECRET=" dashboard/.env; then
    if [[ "$OS_TYPE" == "Darwin" ]]; then
      sed -i '' "s|VITE_SYNQ_SECRET=.*|VITE_SYNQ_SECRET=$BACKEND_SECRET|" dashboard/.env
    else
      sed -i "s|VITE_SYNQ_SECRET=.*|VITE_SYNQ_SECRET=$BACKEND_SECRET|" dashboard/.env
    fi
  else
    echo "VITE_SYNQ_SECRET=$BACKEND_SECRET" >> dashboard/.env
  fi
  echo " OK Synced secret to dashboard"
fi

# 5. Dependencies
echo ""
echo " Installing dependencies..."
(cd backend && npm install --loglevel error)
(cd dashboard && npm install --loglevel error)
(cd extension && npm install --loglevel error)

# 6. Build
echo ""
echo " Building components..."
(cd dashboard && npm run build)
(cd extension && npx esbuild src/content.ts --bundle --outfile=dist/content.js --format=iife --target=es2020 --log-level=error)
(cd extension && npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020 --log-level=error)
(cd extension && npx esbuild popup/popup.ts --bundle --outfile=popup/popup.js --format=iife --target=es2020 --log-level=error)

# 7. Start DBs
PROFILE="full"
if [ "$RAM_GB" -lt 8 ]; then PROFILE="lite"; fi
echo ""
echo " Starting databases (Profile: $PROFILE)..."
docker compose --profile $PROFILE up -d

echo ""
echo " ==================================="
echo "  SYNQ Installed Successfully"
echo " ==================================="
if [ "$GRAPH_BACKEND" == "groq" ]; then
    echo "  IMPORTANT: Ensure GROQ_API_KEY is set in backend/.env"
fi
echo "  Run ./start.sh to begin."
echo ""
