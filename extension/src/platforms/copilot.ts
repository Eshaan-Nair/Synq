import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const copilot = {
  name: "copilot" as const,
  hostname: "copilot.microsoft.com",
  userSelectors: [
    '[data-content="user"]',
    '.user-turn',
    '[class*="user-message"]',
  ],
  responseSelectors: [
    '[data-content="assistant"]',
    '.bot-turn',
    '[data-testid="response-message"]',
    '.ac-textBlock',
    '[class*="message-body"]',
  ],
  inputSelectors: INPUT_SELECTOR_STRATEGIES.copilot,
  sendButtonSelectors: [
    'button[aria-label*="Submit"]',
    'button[aria-label*="Send"]',
  ],
};
