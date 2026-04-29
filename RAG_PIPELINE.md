# RAG Pipeline

SYNQ's RAG (Retrieval-Augmented Generation) pipeline gives the extension automatic context recall. When a session is active, every prompt is automatically enriched with the most semantically relevant chunks from your previous conversations before being sent.

**No manual Connect button. SYNQ auto-connects on init.**

---

## Pipeline Overview

```
Session loaded → content.ts init() → interceptor auto-attaches
       │
       ▼
User types prompt (or presses Enter / clicks send button)
       │
       ▼
Extension intercepts (keydown Enter / send button click, debounced 300ms)
       │
       ▼
POST /api/rag/retrieve  { prompt, sessionId, topN: 3 }
       │
       ▼
Ollama nomic-embed-text → query embedding (768 dimensions)
       │
       ▼
ChromaDB collection query
  where: { sessionId }
  over-fetch: max(topN × 4, 10) results
       │
       ▼
Cosine similarity conversion:
  score = 1 − cosine_distance
  (ChromaDB returns distance, not similarity)
       │
       ▼
Threshold filter: score ≥ 0.30 → discard noise
       │
       ▼
Deduplicate by chunkIndex → keep highest score per chunk
       │
       ▼
Sort descending by score → slice to topN
       │
       ▼
Extension builds context block:
  [SYNQ: Relevant context from your previous session]
  ### Context 1 (relevance: 87%)
  <chunk content, capped at 1500 chars>

  ---

  ### Context 2 (relevance: 71%)
  <chunk content>
  [END SYNQ CONTEXT]

  <original user prompt>
       │
       ▼
Inject into chat input via Selection API + InputEvent → auto-send
```

---

## Storage — The Save Chat Path

When you click **Save Chat**, the extension scrapes the full conversation and the backend processes it in two parallel tracks:

### 1. Privacy Scrub (runs first, in the browser)

The raw text passes through `scrubPII()` before leaving the browser. Patterns matched and replaced:

| Pattern | Replacement |
|---|---|
| JWT tokens (`eyJ...`) | `[REDACTED_JWT]` |
| Bearer tokens | `Bearer [REDACTED_TOKEN]` |
| `sk-`, `pk-`, `gsk-`, `xai-` API keys | `[REDACTED_KEY]` |
| GitHub PATs (`ghp_`, `gho_`, `ghs_`, `ghu_`) | `[REDACTED_GITHUB_TOKEN]` |
| Dotted key format (`abc.def.ghi`) | `[REDACTED_KEY]` |
| `.env` assignments (`KEY=value`) | `KEY=[REDACTED]` |
| Connection strings (`mongodb://...`) | `mongodb://[REDACTED_CONNECTION_STRING]` |
| Private IPv4 addresses | `[REDACTED_INTERNAL_IP]` |
| Email addresses | `[REDACTED_EMAIL]` |

### 2. Sliding Window Chunker

The scrubbed text is split into overlapping word windows. This is a **pure function** — no API calls, no filtering, no information loss.

```
text = "word0 word1 word2 ... word699"
windowWords = 300
overlapWords = 80
step = windowWords - overlapWords = 220

Chunk 0: words 0–299    (id: sessionId-chunk-0)
Chunk 1: words 220–519  (id: sessionId-chunk-1)
Chunk 2: words 440–739  (id: sessionId-chunk-2)
...
```

**Every word in the source text appears in at least one chunk.** This is mathematically guaranteed by the step < window constraint and is tested explicitly in `chunker.test.ts`.

**Why not topic-based splitting?** The v1.0 Groq-based topic splitter was lossy:
- Treated personal facts ("my dog's name is Noob") as filler and discarded them
- Rejected content below a minimum character threshold
- Required a 1–3 second API call on every save, consuming Groq quota
- Introduced variability — the same text could produce different chunks on different calls

The sliding window approach eliminates all of these problems.

### 3. Embedding Generation

Each chunk is embedded using Ollama's `nomic-embed-text` model (768 dimensions). All embeddings are generated **in parallel** via `Promise.all`:

```typescript
// Before (v1.0): sequential — 10 chunks = 10 sequential HTTP calls
for (const chunk of chunks) {
  embeddings.push(await generateEmbedding(chunk.content));
}

// After (v1.2): parallel — 10 chunks = 1 round trip
const embeddings = await Promise.all(chunks.map(c => generateEmbedding(c.content)));
```

### 4. ChromaDB Storage

Before storing new chunks, all existing chunks for the session are deleted. This ensures re-saves are clean — no stale vectors from previous versions of the conversation pollute retrieval.

```
deleteChunksBySession(sessionId)   // purge all existing vectors
→ add(ids, embeddings, documents, metadatas)  // store new set
```

The ChromaDB collection is configured with `hnsw:space: cosine` to use cosine similarity (not the default L2 distance). This is critical for `nomic-embed-text` — L2 distance on 768-dimensional vectors produces values in the range 200–450, making `exp(-distance)` always approximately 0 and rendering similarity scores meaningless.

---

## Similarity Scoring

ChromaDB returns cosine **distance** (0 = identical, 1 = completely different). SYNQ converts this to similarity:

```
score = 1 − cosine_distance
```

| Score Range | Interpretation |
|---|---|
| 1.00 | Identical vectors |
| 0.80–0.99 | Very similar — almost certainly relevant |
| 0.50–0.79 | Related — likely useful context |
| 0.30–0.49 | Loosely related — at the boundary |
| 0.30 | **Threshold** — below this is filtered out |
| < 0.30 | Noise — discarded |

The threshold is `SIMILARITY_THRESHOLD = 0.30` in `src/services/chroma.ts`. This value was chosen empirically for `nomic-embed-text` with cosine similarity. Raise it if injected context feels off-topic; lower it for more aggressive recall at the cost of more noise.

---

## Tuning Parameters

All parameters are in `backend/src/services/chroma.ts` and `backend/src/services/chunker.ts`:

| Parameter | Default | Range | Effect |
|---|---|---|---|
| `topN` | 3 | 1–6 (clamped in route) | Number of chunks injected per prompt. Higher = more context, longer prompts. |
| `SIMILARITY_THRESHOLD` | 0.30 | 0–1 | Raise if context is off-topic. Lower for more aggressive recall. |
| `windowWords` | 300 | 100–500 | Words per chunk (~400 tokens at 300 words). Smaller = more precise, larger = more surrounding context. |
| `overlapWords` | 80 | 0–(windowWords−1) | Overlap between adjacent chunks. Higher = better boundary capture, more redundancy. |
| `EMBED_MODEL` | `nomic-embed-text` | any Ollama model | Swap for any Ollama-compatible embedding model. Update vector dimensions in ChromaDB if changing. |
| `fetchN` | max(topN×4, 10) | — | Over-fetch multiplier. More candidates → better deduplication and threshold filtering. |
| `MAX_CONTEXT_CHARS` | 1500 | — | Character cap per chunk in the injected context block. Prevents exceeding platform prompt limits. |

---

## Auto-Connect vs Classic Inject

| | Auto-Connect (RAG) | Classic Inject |
|---|---|---|
| Trigger | Automatic on every prompt | Manual button click |
| Context source | ChromaDB vector search (semantic similarity) | Neo4j triples → Groq project summary |
| Precision | Per-prompt relevance scoring | Whole-session structured summary |
| Requires | Full Chat saved (Save Chat button) | Any session with triples in Neo4j |
| Best for | Ongoing sessions with history | Starting a fresh chat from scratch |
| User control | Pause/Resume toggle in popup | One-time action |
| Context format | Raw chunk text with relevance % | Structured markdown (Stack, Decisions, Features) |