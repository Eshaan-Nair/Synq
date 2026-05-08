import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const gemini = {
  name: "gemini" as const,
  hostname: "gemini.google.com",
  userSelectors: [
    // Gemini uses obfuscated classes — use multiple approaches
    '.query-text',
    '.user-query',
    '.query-content',
    'user-query',                          // custom web component tag
    'message-content[data-query-text]',    // data attribute variant
    '[data-message-author="user"]',
    // Fallback: Gemini wraps user prompts in specific turn containers
    '.conversation-turn-user',
    'user-message',                         // custom element tag
  ],
  responseSelectors: [
    ".response-content",
    "model-response",
    ".model-response-text",
    "message-content",                      // custom element tag for responses
  ],
  // v1.4.2: multi-strategy selectors via resolver — survives platform UI updates
  inputSelectors: INPUT_SELECTOR_STRATEGIES.gemini,
  sendButtonSelectors: [
    'button[aria-label="Send message"]',
    ".send-button",
    'button.send-button',
  ],
};
