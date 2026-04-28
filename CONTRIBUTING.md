# Contributing to SYNQ

Contributions are very welcome. Whether it's a typo fix or a major feature — all help is appreciated.

## Ways to contribute

- Report bugs — open an Issue with steps to reproduce
- Suggest features — open an Issue tagged `enhancement`
- Fix bugs — check Issues tagged `good first issue`
- Add platform support — see the guide below
- Improve documentation

## Getting started

```bash
# 1. Fork the repo on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/Synq.git
cd synq

# 3. Create a feature branch
git checkout -b feature/what-you-are-building

# 4. Ensure Docker Desktop is running, then start the full stack
./start.sh          # macOS / Linux
start.bat           # Windows

# 5. Make changes and commit
git add .
git commit -m "feat: describe what you did"

# 6. Push and open a Pull Request
git push origin feature/what-you-are-building
```

## Commit format

```
feat: add firefox extension support
fix: correct Claude DOM selector after UI update
docs: improve Windows setup instructions
refactor: simplify triple deduplication logic
```

## Adding support for a new AI platform

Adding a new platform requires changes in three files. Full selector reference: [PLATFORM_SELECTORS.md](PLATFORM_SELECTORS.md)

### 1. Create `extension/src/platforms/yourplatform.ts`

```ts
import type { PlatformConfig } from "./index";

export const yourplatform: PlatformConfig = {
  name: "yourplatform" as const,
  hostname: "yourplatform.com",
  userSelectors: [
    "[data-message-role='user']",           // prefer data-* attributes
    ".user-message-class",                  // class fallback
  ],
  responseSelectors: [
    "[data-message-role='assistant']",  // prefer data-* attributes
    ".ai-response-class",               // class fallback
  ],
  inputSelectors: [
    "#chat-input",
    "[contenteditable='true']",
  ],
  sendButtonSelectors: [
    "button[aria-label='Send']",
    "button[type='submit']",
  ],
};
```

### 2. Register it in `extension/src/platforms/index.ts`

```ts
import { yourplatform } from "./yourplatform";

const ALL_PLATFORMS = [claude, chatgpt, gemini, yourplatform];
```

### 3. `extension/manifest.json`

Add the platform URL in both `host_permissions` and `content_scripts.matches`:
```json
"host_permissions": [
  "https://yourplatform.com/*"
],
"content_scripts": [{
  "matches": ["https://yourplatform.com/*"]
}]
```

To find the correct selectors: open the platform in Chrome, open DevTools (F12), and inspect an AI response element and the chat input box.

**Prefer `data-*` attribute selectors over class names** — they survive UI redesigns much longer:
- Good: `[data-message-author-role='assistant']`
- Fragile: `.font-claude-response` (class names change with every redesign)

## Pull request checklist

- [ ] Tested on the affected platform(s)
- [ ] No secrets or API keys committed
- [ ] Commit message follows the format above
- [ ] `npm run build` passes in `backend/` (TypeScript compiles without errors)
- [ ] `npm run lint` passes in `dashboard/` (no new ESLint errors)
- [ ] README updated if behavior changed

## Questions?

Open an Issue and tag it `question`.
