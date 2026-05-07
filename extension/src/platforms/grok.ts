import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const grok = {
  name: "grok" as const,
  hostname: "x.com",
  userSelectors: [
    '[data-testid="user-message"]',
    ".user-message",
  ],
  responseSelectors: [
    '[data-testid="grok-response"]',
    ".grok-response",
    "[class*='response']",
  ],
  inputSelectors: INPUT_SELECTOR_STRATEGIES.grok,
  sendButtonSelectors: [
    'button[aria-label*="Send"]',
    'button[data-testid="send-button"]',
    'button[type="submit"]',
  ],
};
