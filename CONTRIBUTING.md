# Contributing to GLIA

Thanks for your interest in contributing. Bug fixes, new platform support, UI improvements, documentation, and test coverage are all welcome.

---

## Getting Started

### One Command Setup for Users
```bash
npx glia-ai-setup
```

### For Contributors
```bash
git clone https://github.com/Eshaan-Nair/Glia-AI.git
cd Glia-AI
git checkout -b your-branch-name

# First-time setup (install dependencies and build)
./install.sh          # macOS/Linux
# or
install.bat           # Windows
```

---

## Project Structure

```
backend/src/
  mcp/          MCP server + tools
  middleware/   sanitize.ts
  routes/       chat · context · graph · rag
  services/     chunker · embeddings · extractor · hyde · jobs
                sqlite · sqlite-vector · sqlite-session
                storage · storage.types
                chroma · mongo · neo4j (Docker mode)
  utils/        logger · privacy

extension/src/
  platform/     resolver.ts — input selector strategies
  platforms/    claude · chatgpt · gemini · deepseek · index

dashboard/src/
  components/   GraphView · ChatViewer
```

---

## Development Workflow

### Backend
```bash
cd backend
npm install
npm run dev        # ts-node-dev with hot reload
```

### Extension
```bash
cd extension
npm install
# After every change:
npx esbuild src/content.ts    --bundle --outfile=dist/content.js    --format=iife --target=es2020
npx esbuild src/background.ts --bundle --outfile=dist/background.js --format=iife --target=es2020
npx esbuild popup/popup.ts    --bundle --outfile=popup/popup.js     --format=iife --target=es2020
# Then reload in chrome://extensions
```

### Dashboard (development)
```bash
cd dashboard
npm install
npm run dev    # Vite dev server on port 5173
```

### Dashboard (production build)
```bash
cd dashboard
npm run build  # outputs to dashboard/dist/ — served by backend on port 3001
```

---

## Running Tests

```bash
# Unit tests
cd backend && npm test

# MCP integration test (requires Ollama running, uses SQLite mode)
cd backend && npm test -- --testPathPattern=mcp.integration

# Isolation test (no external dependencies — embeddings are mocked)
cd backend && npm test -- --testPathPattern=isolation.integration

# Full pipeline test (requires Ollama + ChromaDB running — Docker mode)
cd backend && npm test -- --testPathPattern=pipeline.integration
```

---

## Commit Format

```
type(scope): short description

Examples:
feat(extension): add Example platform support
fix(rag): lower similarity threshold for shorter queries
docs(readme): update quick start for v1.5.1
test(pipeline): add edge case for empty conversation
chore(deps): bump chromadb to 0.6.4
```

Types: `feat` · `fix` · `docs` · `test` · `chore` · `refactor` · `perf`

---

## Adding a New AI Platform

This is a great first contribution. Here's the complete process:

### 1. Add input selector strategies to `resolver.ts`

```typescript
// extension/src/platform/resolver.ts
export const INPUT_SELECTOR_STRATEGIES = {
  // ... existing platforms ...
  'new-platform': [
    'textarea[placeholder*="Ask"]',
    '[contenteditable="true"]',
  ],
};
```

### 2. Create the platform file

```typescript
// extension/src/platforms/new-platform.ts
import { INPUT_SELECTOR_STRATEGIES } from '../platform/resolver';

export const newPlatformConfig = {
  name: 'new-platform',
  hostnames: ['example-ai.com'],

  userSelectors: [
    '.user-query',
    '[data-message-role="user"]',
  ],

  responseSelectors: [
    '.prose',
    '[data-message-role="assistant"]',
  ],

  sendSelectors: [
    'button[aria-label="Submit"]',
    'button[type="submit"]',
  ],

  inputSelectors: INPUT_SELECTOR_STRATEGIES['new-platform'],
};
```

### 3. Register in index.ts

```typescript
// extension/src/platforms/index.ts
import { newPlatformConfig } from './new-platform';

export const PLATFORMS = [
  claude,
  chatgpt,
  gemini,
  deepseek,
  newPlatformConfig,   // add here
];
```

### 4. Update manifest.json

```json
{
  "host_permissions": [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://*.example-ai.com/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://claude.ai/*",
      "https://chatgpt.com/*",
      "https://gemini.google.com/*",
      "https://chat.deepseek.com/*",
      "https://*.example-ai.com/*"
    ]
  }]
}
```

### 5. Update PLATFORM_SELECTORS.md

Add a section for the new platform with selectors and stability notes.

### 6. Test

- Load extension → open the new platform → save a short chat → verify chunks stored
- Type a prompt → verify context is prepended

---

## Pull Request Checklist

- [ ] Branch from `main`, not from another feature branch
- [ ] `npx tsc --noEmit` in `backend/` passes with 0 errors
- [ ] Existing tests pass: `cd backend && npm test`
- [ ] PR description explains what changed and why
- [ ] `PLATFORM_SELECTORS.md` updated if you changed selectors
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`

---

## Code Style

- TypeScript strict mode — no `any` unless unavoidable (add a comment explaining why)
- All backend logs through the `logger` utility — no bare `console.log`
- Service functions should be non-fatal where possible (log warning and return gracefully rather than throwing)
- Keep files focused — a service file should do one thing

---

## Good First Issues

Labelled [`good first issue`](https://github.com/Eshaan-Nair/Glia-AI/issues?q=is%3Aissue+label%3A%22good+first+issue%22) in the issue tracker. These are scoped, well-defined, and don't require deep system knowledge.

---

## Questions

Open a [Discussion](https://github.com/Eshaan-Nair/Glia-AI/discussions) for questions, ideas, or anything that isn't a bug.
