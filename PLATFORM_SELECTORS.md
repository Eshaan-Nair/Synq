# Platform Selectors

SYNQ uses CSS selectors to find AI responses and the chat input on each supported platform. These selectors can go stale when a platform updates its DOM.

> **If Save Chat returns 0 messages, or context injection fails silently — check this file first.**
> Platform UIs change regularly. Stale selectors are the most common cause of capture failure.

Run the automated smoke test before releases:
```bash
node scripts/check-selectors.js
```

---

## Claude (claude.ai)

**Last verified:** April 2026 · **Stability:** Medium (UI updates occasionally)

| Element | Selectors (tried in order) | Notes |
|---|---|---|
| User messages | `.font-user-message`, `[data-testid="user-message"]`, `.human-turn`, `.HumanTurn` | `.font-user-message` is most stable |
| AI responses | `.font-claude-response`, `[data-is-streaming]` | Both confirmed present April 2025 |
| Chat input | `div.ProseMirror`, `[contenteditable="true"][data-placeholder]`, `[contenteditable="true"]` | ProseMirror is the most stable |
| Send button | `button[aria-label="Send Message"]`, `button[aria-label="Send message"]`, `button[data-testid="send-button"]`, `button[type="submit"]` | Case-sensitive aria-label varies by version |

**Notes:**
- Claude uses ProseMirror for its rich text input — `div.ProseMirror` is the most stable selector and is unlikely to change without a major editor swap
- `[data-is-streaming]` is present both during and after streaming, making it reliable for scraping completed responses
- If scraping returns empty results, check whether Claude has added a new wrapper element around `.font-claude-response`

---

## ChatGPT (chatgpt.com)

**Last verified:** April 2026 · **Stability:** High (data-* attributes are stable)

| Element | Selectors (tried in order) | Notes |
|---|---|---|
| User messages | `[data-message-author-role="user"]`, `[data-testid="user-message"]` | data-* attributes are very stable |
| AI responses | `[data-message-author-role='assistant']`, `.markdown.prose`, `.agent-turn` | Prefer data-* |
| Chat input | `#prompt-textarea`, `[contenteditable="true"]` | `#prompt-textarea` is a stable `<textarea>` element |
| Send button | `button[data-testid="send-button"]`, `button[aria-label="Send prompt"]` | |

**Notes:**
- `[data-message-author-role]` is the most reliable selector — OpenAI has kept this data attribute stable across multiple redesigns
- `#prompt-textarea` is a standard `<textarea>` (not contenteditable), which makes input injection straightforward

---

## Gemini (gemini.google.com)

**Last verified:** April 2026 · **Stability:** Low (updates most frequently — expect breakage)

| Element | Selectors (tried in order) | Notes |
|---|---|---|
| User messages | `.query-text`, `.user-query`, `user-query`, `[data-message-author="user"]`, `.conversation-turn-user` | Multiple fallbacks needed — UI changes often |
| AI responses | `.response-content`, `model-response`, `.model-response-text`, `message-content` | `model-response` is a custom element — stable when present |
| Chat input | `.ql-editor`, `rich-textarea [contenteditable="true"]`, `[contenteditable="true"]` | Gemini uses Quill editor |
| Send button | `button[aria-label="Send message"]`, `.send-button`, `button.send-button` | |

**Notes:**
- Gemini's DOM uses Angular's obfuscated class names heavily — these change often
- `model-response` and `user-query` are custom web component tags, which are more stable than class-based selectors
- If Gemini capture fails, this is the most likely platform to have had a breaking DOM update

---

## How the Selector System Works

`queryAll()` in `extension/src/platforms/index.ts` tries every selector and merges the results:

```typescript
export function queryAll(selectors: string[]): Element[] {
  const seen = new Set<Element>();
  const results: Element[] = [];

  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      }
    } catch { /* invalid selector — skip */ }
  }

  // Remove ancestors — keep the most specific (deepest) element
  // Prevents double-scraping when a parent and child both match
  return results.filter(el =>
    !results.some(other => other !== el && other.contains(el))
  );
}
```

**Key properties:**
- Adding more fallback selectors is always safe — it won't break existing ones
- Parent/child deduplication ensures a response element and its inner content wrapper don't both get captured as separate messages
- Invalid CSS selectors are silently skipped

---

## Diagnosing Broken Selectors

If SYNQ captures 0 messages or injection doesn't work:

1. **Open Chrome DevTools** (F12) on the affected platform
2. Go to the **Console** tab
3. Paste the selector and run it:
   ```javascript
   document.querySelectorAll('.font-claude-response')
   // Should return NodeList with response elements
   ```
4. If it returns an empty NodeList, the selector is stale
5. Use the **Elements** tab to inspect an AI response element and find the new class or attribute
6. Add the new selector to the front of the relevant array in `extension/src/platforms/yourplatform.ts`
7. Rebuild: `cd extension && npm run build`
8. Reload the extension in `chrome://extensions`

**Prefer data-* attributes over class names** when adding new selectors:
- `[data-message-author-role='assistant']` — stable across redesigns
- `.font-claude-response` — can change with any style update

---

## Adding a New Platform

1. Create `extension/src/platforms/yourplatform.ts` with the four selector arrays
2. Register in `extension/src/platforms/index.ts`
3. Add to `extension/manifest.json` (both `host_permissions` and `content_scripts.matches`)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full step-by-step guide.

---

## Reporting Stale Selectors

If you find a broken selector, open an Issue with:
- Platform name and URL
- Your browser version and OS
- Which operation failed (Save Chat / Inject / neither)
- What you found in DevTools (the new selector, if you identified it)

Issues tagged `selector-stale` get prioritized — they affect all users on that platform.