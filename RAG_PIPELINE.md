# RAG Pipeline

SYNQ's RAG (Retrieval-Augmented Generation) pipeline gives the extension automatic context recall — when a session is active, every prompt you type is enriched with the most relevant chunks from your previous chats before being sent. **No manual Connect button needed — SYNQ auto-connects on init.**

## Overview

```
Session loaded → Extension auto-attaches interceptor on init()
       │
       ▼
User types prompt
       │
       ▼
Extension intercepts (keydown Enter / send button click)
       │
       ▼
POST /api/rag/retrieve  { prompt, sessionId, topN: 3 }
       │
       ▼
Ollama nomic-embed-text → query embedding (768 dimensions)
       │
       ▼
ChromaDB collection query (where: { sessionId })
       │
       ▼
Cosine similarity:  score = 1 - cosine_distance
       │
       ▼
Filter: score ≥ 0.30 threshold  (discard noise)
       │
       ▼
Deduplicate by chunkIndex (keep highest scoring per chunk)
       │
       ▼
Return top-3 by score
       │
       ▼
Extension builds contextual prompt:
  [SYNQ: Relevant context from your previous session]
  ### Context 1 (relevance: 87%)
  <chunk content>
  [END SYNQ CONTEXT]
  <original user prompt>
       │
       ▼
Inject into chat input → auto-send
```

## Storage (Save Chat path)

When you click **Save Chat**, the extension scrapes the full conversation (both user and AI turns), then the backend:

1. **PII scrubs** the text (API keys, JWTs, emails, etc.)
2. **Sliding window chunker** — splits into overlapping 300-word windows with 80-word overlap. This is a **pure function** — no AI call, no filtering. Every word in the raw chat ends up in at least one chunk. Personal facts like "my dog's name is Noob" are preserved as-is.
3. **Embeds** each chunk via Ollama `nomic-embed-text` — all embeddings fired **in parallel** with `Promise.all`
4. **Stores** in ChromaDB collection `synq_chunks_v2` — all existing vectors for the session are purged first, then the new set is stored (clean re-save, no stale vectors)

### Why sliding window instead of topic splitting?

The v1.0/v1.1 Groq-based topic splitter was **lossy** — it treated personal facts as "filler" and discarded them. The sliding window approach is:

| | Groq topic splitter (v1.0) | Sliding window (v1.2) |
|---|---|---|
| Personal facts | Deleted ("my dog is Noob" → gone) | Preserved as-is |
| Short messages | Rejected (< min chars) | Always included |
| API dependency | Yes (Groq call per save) | None (pure function) |
| Latency | 1-3s per save | 0ms |
| Information loss | Significant | Zero |

## Similarity Scoring

SYNQ's ChromaDB collection is configured with **cosine similarity** (`hnsw:space: cosine`), which is the correct metric for `nomic-embed-text`'s 768-dimensional vectors.

ChromaDB returns cosine **distance** (not similarity), so SYNQ converts it:

```
score = 1 - cosine_distance
```

This gives a score in `[0, 1]` where 1 = identical vectors.

| Cosine Similarity | Interpretation |
|---|---|
| 1.00 | Identical |
| 0.80+ | Very similar — almost certainly relevant |
| 0.50–0.79 | Related — likely useful |
| 0.30 | Threshold — boundary between signal and noise |
| < 0.30 | Noise — filtered out |

The threshold is set to **0.30** (`SIMILARITY_THRESHOLD` in `chroma.ts`). Raise it if injected context feels off-topic; lower it for more aggressive recall.

## Tuning

| Parameter           | Default | Range | Notes |
|---------------------|---------|-------|-------|
| `topN`              | 3       | 1–6   | Number of chunks to inject. 3 = good balance of precision/recall |
| `SIMILARITY_THRESHOLD` | 0.30 | 0–1  | Lower = more results, more noise. Raise if context is off-topic |
| `windowWords`       | 300     | 100–500 | Words per chunk. Smaller = more precise, larger = more context |
| `overlapWords`      | 80      | 0–150 | Overlap between adjacent chunks. Ensures boundary-spanning facts are captured |
| `EMBED_MODEL`       | `nomic-embed-text` | — | Can be swapped for any Ollama-compatible embedding model |

## Auto-Connect vs Classic Inject

| Feature | Auto-Connect (RAG) | Classic Inject |
|---|---|---|
| Trigger | Automatic on every prompt (auto-attaches on init) | Manual button click |
| Context source | ChromaDB vector search (semantic) | Neo4j triples → Groq summary |
| Precision | Per-prompt relevance scoring | Whole-session summary |
| Requires | Full Chat saved (Save Chat button) | Any saved session with triples in Neo4j |
| Best for | Active development session | Starting a new chat from scratch |
| User control | Pause/Resume toggle in popup | One-time action |
