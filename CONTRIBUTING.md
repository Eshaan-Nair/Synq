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
git clone https://github.com/YOUR-USERNAME/synq.git
cd synq

# 3. Create a feature branch
git checkout -b feature/what-you-are-building

# 4. Start the full stack
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

Adding a new platform requires changes in two files:

### 1. `extension/src/content.ts`

**`detectPlatform()`** — add a hostname check:
```ts
if (host.includes("yourplatform.com")) return "yourplatform";
```

**`getResponseSelector()`** — add the CSS selector that wraps AI responses:
```ts
case "yourplatform": return ".ai-response-class";
```

**`getInputSelector()`** — add the CSS selector for the chat input:
```ts
case "yourplatform": return "#chat-input-id";
```

### 2. `extension/manifest.json`

Add the platform URL in both `host_permissions` and `content_scripts.matches`:
```json
"host_permissions": [
  "https://yourplatform.com/*"
],
"content_scripts": [{
  "matches": ["https://yourplatform.com/*"]
}]
```

To find the correct selectors: open the platform in Chrome, open DevTools (F12), and inspect an AI response element and the chat input box. Copy the most stable class or attribute selector you can find.

## Finding stable selectors

Prefer attribute selectors over class names — they tend to survive UI updates longer:
- Good: `[data-message-author-role='assistant']`
- Fragile: `.font-claude-response` (class names change often)

## Pull request checklist

- [ ] Tested on the affected platform(s)
- [ ] No secrets or API keys committed
- [ ] Commit message follows the format above
- [ ] README updated if behavior changed

## Questions?

Open an Issue and tag it `question`.
