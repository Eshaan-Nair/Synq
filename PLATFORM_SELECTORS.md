# Platform Selectors

SYNQ uses CSS selectors to find AI responses and the chat input on each platform. These selectors can change when a platform updates its UI.

> **If capture returns 0 facts or injection fails, check this file first.**
> Open an issue with your browser version if a selector has gone stale.

---

## Claude (claude.ai)

Last verified: **April 2025**

| Element | Selectors (tried in order) |
|---|---|
| AI responses | `.font-claude-response`, `[data-is-streaming]` |
| Chat input | `div.ProseMirror`, `[contenteditable="true"][data-placeholder]`, `[contenteditable="true"]` |
| Send button | `button[aria-label="Send Message"]`, `button[aria-label="Send message"]`, `button[data-testid="send-button"]`, `button[type="submit"]` |

**Notes:**
- Claude uses ProseMirror for its input — `div.ProseMirror` is the most stable selector.
- `[data-is-streaming]` captures both in-progress and completed responses.

---

## ChatGPT (chatgpt.com)

Last verified: **April 2025**

| Element | Selectors (tried in order) |
|---|---|
| AI responses | `[data-message-author-role='assistant']`, `.markdown.prose`, `.agent-turn` |
| User messages | `[data-testid="user-message"]`, `[data-message-author-role="user"]` |
| Chat input | `#prompt-textarea`, `[contenteditable="true"]` |
| Send button | `button[data-testid="send-button"]`, `button[aria-label="Send prompt"]` |

**Notes:**
- `#prompt-textarea` is a stable `<textarea>` element — less likely to break than contenteditable selectors.
- `[data-message-author-role]` is the most stable response selector.

---

## Gemini (gemini.google.com)

Last verified: **April 2025**

| Element | Selectors (tried in order) |
|---|---|
| AI responses | `.response-content`, `model-response`, `.model-response-text` |
| Chat input | `.ql-editor`, `[contenteditable="true"]` |
| Send button | `button[aria-label="Send message"]`, `.send-button` |

**Notes:**
- Gemini uses Quill editor (`.ql-editor`) for its input.
- Gemini's UI updates most frequently — if something breaks here first, that's expected.

---

## How fallback selection works

SYNQ tries **all selectors** and merges their results, deduplicating by DOM ancestry (keeping the most specific/deepest element when a parent and child both match):

```ts
// All selectors are tried and results merged (deduplicating by DOM ancestry)
export function queryAll(selectors: string[]): Element[] {
  const seen = new Set<Element>();
  const results: Element[] = [];
  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        if (!seen.has(el)) { seen.add(el); results.push(el); }
      }
    } catch { /* invalid selector */ }
  }
  // Remove ancestors — keep the most specific (deepest) element
  return results.filter(el => !results.some(o => o !== el && o.contains(el)));
}
```

This means adding more fallbacks to any platform config is always safe — it won't affect the primary selector as long as it still matches.

---

## Adding a new platform

1. Create `extension/src/platforms/yourplatform.ts`:
```ts
export const yourplatform = {
  name: "yourplatform" as const,
  hostname: "yourplatform.com",
  responseSelectors: [".ai-response", "[data-role='assistant']"],
  inputSelectors: ["#chat-input", "[contenteditable='true']"],
  sendButtonSelectors: ["button[type='submit']", ".send-btn"],
};
```

2. Register it in `extension/src/platforms/index.ts`:
```ts
import { yourplatform } from "./yourplatform";
const platforms = [claude, chatgpt, gemini, yourplatform];
```

3. Add to `extension/manifest.json`:
```json
"host_permissions": ["https://yourplatform.com/*"],
"content_scripts": [{ "matches": ["https://yourplatform.com/*"] }]
```

4. **Finding stable selectors:** Open DevTools → inspect an AI response and the input box. Prefer `data-*` attribute selectors over class names — they survive redesigns better.
