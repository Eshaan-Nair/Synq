# Contributing to SYNQ

Thank you for your interest in contributing. Whether it's a typo fix, a bug report, a new platform, or a major feature — all contributions are genuinely appreciated.

## Ways to Contribute

- **Report bugs** — open an Issue using the bug report template with steps to reproduce
- **Suggest features** — open an Issue tagged `enhancement` with a clear use-case description
- **Fix bugs** — check Issues tagged `good first issue` for approachable starting points
- **Add platform support** — the step-by-step guide is below
- **Improve selectors** — platform UIs change; stale selectors are the most common breakage
- **Write tests** — coverage is most needed in `src/routes/` and `src/services/`
- **Improve documentation** — clearer install instructions, better examples, corrected links

---

## Getting Started

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/Synq.git
cd Synq

# 2. Create a feature branch
git checkout -b feature/what-you-are-building

# 3. Ensure Docker Desktop is running, then start the full stack
./start.sh          # macOS / Linux
start.bat           # Windows

# 4. Make your changes and commit
git add .
git commit -m "feat: describe what you did"

# 5. Push and open a Pull Request against main
git push origin feature/what-you-are-building
```

---

## Commit Message Format

```
feat: add Firefox extension support
fix: correct Claude DOM selector after UI update
docs: improve Windows setup instructions
refactor: simplify triple deduplication logic
test: add edge cases for slidingWindowChunks overlap guard
chore: bump ChromaDB to 0.7.0
```

Use lowercase. Keep the first line under 72 characters. No trailing period.

---

## Pull Request Checklist

Before opening a PR, confirm:

- [ ] Tested manually on the affected platform(s)
- [ ] `npm test` passes in `backend/` with no new failures
- [ ] `npm run build` passes in `backend/` (TypeScript compiles clean)
- [ ] `npm run lint` passes in `dashboard/` (no new ESLint errors)
- [ ] No secrets, API keys, or personal data committed
- [ ] Commit messages follow the format above
- [ ] README or relevant docs updated if behaviour changed

---

## Adding Support for a New AI Platform

Adding a new platform requires changes in exactly three files.

> Before writing selectors, read [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md) for guidance on finding stable selectors and understanding how the fallback system works.

### Step 1 — Create `extension/src/platforms/yourplatform.ts`

```ts
import type { PlatformConfig } from "./index";

export const yourplatform: PlatformConfig = {
  name: "yourplatform" as const,
  hostname: "yourplatform.com",

  // User message containers — tried in order, results merged
  userSelectors: [
    "[data-message-role='user']",      // prefer data-* attributes — survive redesigns
    ".user-message-container",         // class fallback
  ],

  // AI response containers — tried in order, results merged
  responseSelectors: [
    "[data-message-role='assistant']",
    ".ai-response-container",
  ],

  // Chat input — the element that receives typed text
  inputSelectors: [
    "#chat-input",
    "[contenteditable='true']",
  ],

  // Send button — for intercepting submission
  sendButtonSelectors: [
    "button[aria-label='Send']",
    "button[type='submit']",
  ],
};
```

**Selector tips:**
- Prefer `data-*` attribute selectors over class names — classes change with every UI redesign; data attributes are intentional and stable
- Good: `[data-message-author-role='assistant']`
- Fragile: `.font-claude-response`
- Add multiple fallbacks — the system tries all of them and deduplicates results
- Use Chrome DevTools (F12) → Elements panel to inspect the live DOM

### Step 2 — Register in `extension/src/platforms/index.ts`

```ts
import { yourplatform } from "./yourplatform";

// Add to the platforms array
const platforms: PlatformConfig[] = [claude, chatgpt, gemini, yourplatform];
```

Also add the type to the `Platform` union:

```ts
export type Platform = "claude" | "chatgpt" | "gemini" | "yourplatform" | "unknown";
```

### Step 3 — Update `extension/manifest.json`

Add the new platform to both `host_permissions` and `content_scripts.matches`:

```json
{
  "host_permissions": [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://yourplatform.com/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://claude.ai/*",
      "https://chatgpt.com/*",
      "https://gemini.google.com/*",
      "https://yourplatform.com/*"
    ],
    "js": ["dist/content.js"],
    "run_at": "document_idle"
  }]
}
```

### Step 4 — Test

1. Build the extension: `cd extension && npm run build`
2. Reload the extension in `chrome://extensions`
3. Open your new platform and verify:
   - The SYNQ badge appears
   - Save Chat captures messages correctly
   - Context injection works on a new prompt

---

## Running Tests

```bash
cd backend
npm test                    # run all unit tests
npm run test:coverage       # with coverage report
```

Tests live in `backend/src/__tests__/`. The test suite covers:
- `chunker.test.ts` — sliding window chunker (edge cases, overlap, zero data loss guarantee)
- `privacy.test.ts` — PII scrubbing (JWTs, API keys, emails, connection strings, IPs)
- `rag.test.ts` — cosine distance conversion, threshold filtering, deduplication pipeline

New tests for route handlers and services are very welcome — those areas currently have no coverage.

---

## Code Style

- TypeScript strict mode is enforced in all three packages
- The backend uses a shared `logger` utility — never use `console.log` directly
- Route handlers validate all inputs before touching a database
- Services are non-fatal by default — wrap external calls in try/catch and log warnings, don't crash the server

---

## Questions?

Open an Issue tagged `question`. Response time is typically within 48 hours.