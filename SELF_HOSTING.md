# GLIA — Self-Hosting Guide

This guide covers custom configuration, port changes, backups, and running GLIA behind a reverse proxy.

---

## Default Ports

| Service | Port | Change via |
|---|---|---|
| Backend + Dashboard | 3001 | `PORT=3002` in `backend/.env` |
| Neo4j HTTP | 7474 | `docker-compose.yml` ports section |
| Neo4j Bolt | 7687 | `docker-compose.yml` ports section |
| MongoDB | 27017 | `docker-compose.yml` ports section |
| ChromaDB | 8000 | `docker-compose.yml` ports section |
| Ollama | 11434 | Ollama config / `OLLAMA_URL` in `.env` |

---

## Custom Passwords

Edit `backend/.env`:

```env
NEO4J_PASSWORD=your-strong-password
MONGO_URI=mongodb://glia:your-strong-password@localhost:27017/gliadb?authSource=admin
```

And update `docker-compose.yml` to match:

```yaml
neo4j:
  environment:
    - NEO4J_AUTH=neo4j/your-strong-password

mongodb:
  environment:
    - MONGO_INITDB_ROOT_USERNAME=glia
    - MONGO_INITDB_ROOT_PASSWORD=your-strong-password
```

Restart: `docker compose down && docker compose --profile full up -d`

---

## Docker Profiles

GLIA supports two Docker profiles:

| Profile | Services | Use when |
|---|---|---|
| `full` | Neo4j + MongoDB + ChromaDB | 8 GB+ RAM, want knowledge graph |
| `lite` | MongoDB + ChromaDB only | < 8 GB RAM, or don't need graph |

```bash
# Full mode
docker compose --profile full up -d

# Lite mode
docker compose --profile lite up -d
# or:
docker compose -f docker-compose.lite.yml up -d
```

Override RAM auto-detection: `GLIA_PROFILE=full` or `GLIA_PROFILE=lite` before running a launcher.

---

## Data Backup

### SQLite Mode (Zero-Docker)

All data is in a single file. Back it up with a simple copy:

```bash
# Stop the backend first, then:
cp backend/glia.db backend/glia.db.backup

# Or with a timestamp:
cp backend/glia.db backend/glia_$(date +%Y%m%d).db.backup
```

Restore by copying the backup file back:
```bash
cp backend/glia_20260517.db.backup backend/glia.db
```

### Docker Mode

All data lives in named Docker volumes:

| Volume | Contains |
|---|---|
| `glia_neo4j_data` | Knowledge graph triples |
| `glia_mongo_data` | Sessions, FullChat documents |
| `glia_chroma_data` | Vector embeddings |

### Backup

```bash
# Stop services first
docker compose down

# Backup each volume
docker run --rm -v glia_mongo_data:/data -v $(pwd)/backups:/backup alpine \
  tar czf /backup/mongo_$(date +%Y%m%d).tar.gz /data

docker run --rm -v glia_neo4j_data:/data -v $(pwd)/backups:/backup alpine \
  tar czf /backup/neo4j_$(date +%Y%m%d).tar.gz /data

docker run --rm -v glia_chroma_data:/data -v $(pwd)/backups:/backup alpine \
  tar czf /backup/chroma_$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
docker run --rm -v glia_mongo_data:/data -v $(pwd)/backups:/backup alpine \
  tar xzf /backup/mongo_20260505.tar.gz -C /
```

---

## Reset All Data

```bash
docker compose down -v   # removes containers AND volumes
docker compose --profile full up -d
```

> This deletes all conversations, graph triples, and embeddings permanently.

---

## Reverse Proxy (nginx)

To expose the dashboard at a custom domain:

```nginx
server {
    server_name glia.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Update `ALLOWED_ORIGINS` in `backend/src/index.ts` to include your domain:

```typescript
const ALLOWED_ORIGINS = [
  "http://localhost:3001",
  "https://glia.yourdomain.com",
  // ...
];
```

Enable request authentication at the proxy level (e.g. Basic Auth in nginx) if exposing the dashboard to the public internet. GLIA is designed for local-first usage and does not include built-in user authentication.

---

## Custom Ollama URL

If Ollama is running on a different machine or port:

```env
# backend/.env
OLLAMA_URL=http://192.168.1.100:11434
```

---

## Custom ChromaDB URL

```env
CHROMA_URL=http://your-chroma-host:8000
```

---

## Force Extraction Backend

```env
# Force Ollama (ignore Groq fallback even if Ollama is down)
GRAPH_BACKEND=ollama

# Force Groq (requires GROQ_API_KEY)
GRAPH_BACKEND=groq
GROQ_API_KEY=gsk_your_key_here
```

---

## Checking Service Health

```bash
# Backend
curl http://localhost:3001/health

# ChromaDB
curl http://localhost:8000/api/v1/heartbeat

# Neo4j
curl http://localhost:7474

# Ollama
curl http://localhost:11434/api/tags

# MongoDB
docker exec glia_mongo mongosh --eval "db.adminCommand('ping')"
```
