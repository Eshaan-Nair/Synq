import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const deepseek = {
  name: "deepseek" as const,
  hostname: "chat.deepseek.com",
  userSelectors: [
    // Primary — role attribute (most stable across redesigns)
    '[data-message-author-role="user"]',
    // DeepSeek uses distinct class blocks per message role
    '.user-message',
    '[class*="UserMessage"]',
    '[class*="user_message"]',
    // Fallback via aria
    '[aria-label*="You"]',
    // Structural: sibling before AI response block
    '[data-testid="user-message"]',
  ],
  responseSelectors: [
    // Primary — role attribute
    '[data-message-author-role="assistant"]',
    // DeepSeek markdown response container
    '.ds-markdown',
    '[class*="AssistantMessage"]',
    '[class*="assistant_message"]',
    '[class*="markdown-body"]',
    // Generic prose fallback
    '.prose',
  ],
  // v1.4.2: multi-strategy selectors via resolver — survives platform UI updates
  inputSelectors: INPUT_SELECTOR_STRATEGIES.deepseek,
  sendButtonSelectors: [
    'button[aria-label="Send message"]',
    'button[aria-label="Send"]',
    'button[data-testid="send-button"]',
    '[data-testid="send-button"]',
    '#chat-input ~ button',
    'button:has(svg[class*="send"])',
    'button[type="submit"]',
  ],
};
