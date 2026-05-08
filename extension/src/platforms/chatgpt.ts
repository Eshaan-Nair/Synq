import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const chatgpt = {
  name: "chatgpt" as const,
  hostname: "chatgpt.com",
  userSelectors: [
    '[data-message-author-role="user"]',
    '[data-testid="user-message"]',
  ],
  responseSelectors: [
    "[data-message-author-role='assistant']",
    ".markdown.prose",
    ".agent-turn",
  ],
  // v1.4.2: multi-strategy selectors via resolver — survives platform UI updates
  inputSelectors: INPUT_SELECTOR_STRATEGIES.chatgpt,
  sendButtonSelectors: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
  ],
};
