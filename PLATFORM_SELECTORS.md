# Platform Selectors

ArcRift uses CSS selectors to find AI responses and the chat input on each supported platform. These selectors can go stale when a platform updates its DOM.

> **If Save Chat returns 0 messages, or context injection does nothing — check this file first.**

A weekly CI job ([`.github/workflows/selector-check.yml`](.github/workflows/selector-check.yml)) runs a headless Playwright check on all three platforms every Monday at 9 AM UTC. If any selector fails, it auto-creates a GitHub issue tagged `bug` + `selector-stale`.

---

## How the Selector System Works (v1.5.2)

As of v1.5.2, **input box selectors** use a multi-strategy resolver defined centrally in `extension/src/platform/resolver.ts`.

Each platform has an ordered array of strategies. The resolver tries each in sequence and returns the first match:

```typescript
// resolver.ts (simplified)
export const INPUT_SELECTOR_STRATEGIES = {
  claude: [
    'div.ProseMirror',
    '[data-placeholder][contenteditable]',
    '[data-testid="composer-input"]',
    '[aria-label="Message Claude"][contenteditable]',
    'div[role="textbox"][contenteditable]',
    '[contenteditable="true"]',
  ],
  chatgpt: [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'div[placeholder*="Message"][contenteditable]',
    '[contenteditable="true"]',
  ],
  gemini: [
    '.ql-editor',
    'rich-textarea [contenteditable="true"]',
    '[aria-label*="message"][contenteditable]',
    'div[role="textbox"][contenteditable]',
    '[contenteditable="true"]',
  ],
  deepseek: [
    '#chat-input',
    'textarea[placeholder*="Send a message"]',
    'textarea[data-testid="chat-input"]',
    'div[contenteditable][role="textbox"]',
    'textarea',
  ],
  grok: [
    "textarea[placeholder*='Ask']",
    "textarea[data-testid='grok-input']",
    "textarea[data-testid='tweetTextarea_0']",
    '[contenteditable="true"][aria-label*="message"]',
    "textarea",
  ],
  copilot: [
    'textarea#userInput',
    'textarea[data-testid="composer-input"]',
    'textarea[placeholder*="Message"]',
    '#userInput',
    '[contenteditable="true"]',
  ],
  mistral: [
    'div.ProseMirror',
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="message"]',
    '[contenteditable="true"]',
  ],
};
```

A `watchForInput()` function uses a MutationObserver — if the input is not yet in the DOM (SPA navigation still loading), it watches for up to 10 seconds and calls back when it appears.

**User message and AI response selectors** are still defined per-platform and tried via `queryAll()` which deduplicates by DOM ancestry (keeps deepest matching element when parent and child both match).

---

## Claude (claude.ai)

**Last verified:** May 2026 · **Stability:** Medium

| Element | Selectors (in order) |
|---|---|
| User messages | `.font-user-message`, `[data-testid="user-message"]`, `.human-turn`, `.HumanTurn` |
| AI responses | `.font-claude-response`, `[data-is-streaming]` |
| Chat input | See resolver.ts — `div.ProseMirror` is most stable |
| Send button | `button[aria-label="Send Message"]`, `button[aria-label="Send message"]`, `button[data-testid="send-button"]`, `button[type="submit"]` |

**Notes:**
- Claude uses ProseMirror for its rich text editor — `div.ProseMirror` is the most stable selector
- `[data-is-streaming]` is present both during and after streaming, making it reliable for scraping completed responses

---

## ChatGPT (chatgpt.com)

**Last verified:** May 2026 · **Stability:** High

| Element | Selectors (in order) |
|---|---|
| User messages | `[data-message-author-role="user"]`, `[data-testid="user-message"]` |
| AI responses | `[data-message-author-role='assistant']`, `.markdown.prose`, `.agent-turn` |
| Chat input | See resolver.ts — `#prompt-textarea` is most stable |
| Send button | `button[data-testid="send-button"]`, `button[aria-label="Send prompt"]` |

**Notes:**
- `[data-message-author-role]` — OpenAI has kept this data attribute stable across multiple redesigns
- `#prompt-textarea` is a standard `<textarea>` (not contenteditable), making injection straightforward

---

## Gemini (gemini.google.com)

**Last verified:** May 2026 · **Stability:** Low — updates most frequently

| Element | Selectors (in order) |
|---|---|
| User messages | `.query-text`, `.user-query`, `user-query`, `[data-message-author="user"]`, `.conversation-turn-user` |
| AI responses | `.response-content`, `model-response`, `.model-response-text`, `message-content` |
| Chat input | See resolver.ts — `.ql-editor` is most stable |
| Send button | `button[aria-label="Send message"]`, `.send-button`, `button.send-button` |

**Notes:**
- Gemini uses Angular's obfuscated class names — these change frequently
- `model-response` and `user-query` are custom web component tags, more stable than class-based selectors
- If Gemini capture fails, this is the most likely platform to have had a breaking DOM update

---

## DeepSeek (chat.deepseek.com)

**Last verified:** May 2026 · **Stability:** Medium

| Element | Selectors (in order) |
|---|---|
| User messages | `[data-message-author-role="user"]`, `.user-message`, `[class*="UserMessage"]`, `[data-testid="user-message"]` |
| AI responses | `[data-message-author-role="assistant"]`, `.ds-markdown`, `[class*="AssistantMessage"]`, `[class*="markdown-body"]` |
| Chat input | See resolver.ts — `#chat-input` is most stable |
| Send button | `button[aria-label="Send message"]`, `[data-testid="send-button"]`, `button[type="submit"]` |

**Notes:**
- DeepSeek uses `<textarea id="chat-input">` — the stable ID makes injection reliable
- `.ds-markdown` is prefixed with `ds-` (product namespace) — more durable than generic class names
- `[data-message-author-role]` mirrors the ChatGPT attribute pattern; if it was adopted intentionally it should remain stable

---

## Grok (x.com)

**Last verified:** May 2026 · **Stability:** Medium

| Element | Selectors (in order) |
|---|---|
| User messages | `[data-testid="user-message"]`, `.user-message` |
| AI responses | `[data-testid="grok-response"]`, `.grok-response`, `[class*='response']` |
| Chat input | See resolver.ts — `textarea[placeholder*='Ask']` → `textarea[data-testid='grok-input']` → `textarea[data-testid='tweetTextarea_0']` |
| Send button | `button[aria-label*="Send"]`, `button[data-testid="send-button"]`, `button[type="submit"]` |

**Notes:**
- Grok is served directly on x.com — custom `data-testid` attributes are utilized to isolate grok responses from typical tweets.

---

## Microsoft Copilot (copilot.microsoft.com)

**Last verified:** May 2026 · **Stability:** High

| Element | Selectors (in order) |
|---|---|
| User messages | `[data-content="user"]`, `.user-turn`, `[class*="user-message"]` |
| AI responses | `[data-content="assistant"]`, `.bot-turn`, `[data-testid="response-message"]`, `.ac-textBlock` |
| Chat input | See resolver.ts — `textarea#userInput` → `textarea[data-testid="composer-input"]` → `textarea[placeholder*="Message"]` |
| Send button | `button[aria-label*="Submit"]`, `button[aria-label*="Send"]` |

**Notes:**
- Copilot uses structured `data-content` markers to tag user and assistant dialog blocks, which is extremely robust.
- Standard M365 Copilot runs on the same domain and benefits from this out-of-the-box configuration.

---

## Mistral (chat.mistral.ai)

**Last verified:** May 2026 · **Stability:** High

| Element | Selectors (in order) |
|---|---|
| User messages | `[data-message-author-role="user"]`, `.user-message`, `[data-role="user"]` |
| AI responses | `[data-message-author-role="assistant"]`, `.assistant-message`, `[data-role="assistant"]` |
| Chat input | See resolver.ts — `div.ProseMirror` is most stable (Mistral uses ProseMirror, not a textarea) |
| Send button | `button[aria-label="Send"]`, `button[type="submit"]`, `button[aria-label*="send" i]` |

**Notes:**
- Mistral uses a **ProseMirror** `div[contenteditable]` editor — `div.ProseMirror` is the correct and most stable input selector. A `textarea` selector will never match.
- Messages are tagged with `data-message-author-role="user"` and `data-message-author-role="assistant"` — the same pattern used by ChatGPT and DeepSeek. These are more durable than the class-based `.user-message`/`.assistant-message` fallbacks.
- Verified live via headless browser inspection in May 2026.

---

## Diagnosing Broken Selectors

If ArcRift captures 0 messages or injection does nothing:

1. Open **Chrome DevTools** (F12) on the affected platform
2. Go to **Console** and run:
   ```javascript
   document.querySelectorAll('.font-claude-response')
   // Should return NodeList with response elements
   ```
3. If it returns an empty NodeList, the selector is stale
4. Use the **Elements** tab to inspect an AI response and find the new class or attribute
5. Add the new selector to `resolver.ts` (for input) or the platform file (for messages)
6. Rebuild: in the `extension/` folder, run esbuild or `start.bat`/`start.sh`
7. Reload the extension in `chrome://extensions`

**Prefer data-* attributes** when adding selectors — they survive visual redesigns better than class names.

---

## Adding a New Platform

1. Add input strategies to `resolver.ts` under `INPUT_SELECTOR_STRATEGIES.yourplatform`
2. Create `extension/src/platforms/yourplatform.ts` with userSelectors, responseSelectors, sendSelectors, and inputSelectors
3. Register in `extension/src/platforms/index.ts`
4. Add to `extension/manifest.json` (`host_permissions` and `content_scripts.matches`)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## Reporting Stale Selectors

Open an Issue with:
- Platform and URL
- Browser version and OS
- Which operation failed (Save Chat / Auto-Connect / Inject)
- New selector if found in DevTools

Issues tagged `selector-stale` are prioritized — they affect all users on that platform.
