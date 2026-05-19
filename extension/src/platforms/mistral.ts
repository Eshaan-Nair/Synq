import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const mistral = {
  name: "mistral" as const,
  hostname: "chat.mistral.ai",
  userSelectors: [
    '[data-message-author-role="user"]',
    '.user-message',
    '[data-role="user"]',
  ],
  responseSelectors: [
    '[data-message-author-role="assistant"]',
    '.assistant-message',
    '[data-role="assistant"]',
  ],
  inputSelectors: INPUT_SELECTOR_STRATEGIES.mistral,
  sendButtonSelectors: [
    'button[type="submit"]',
    'button[aria-label*="send" i]',
  ],
};
