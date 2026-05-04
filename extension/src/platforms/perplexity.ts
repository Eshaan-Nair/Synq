import { INPUT_SELECTOR_STRATEGIES } from "../platform/resolver";

export const perplexity = {
  name: "perplexity" as const,
  hostname: "perplexity.ai",
  userSelectors: [
    // Primary — data attribute, survives class renames
    '[data-testid="user-message"]',
    // Perplexity uses a dark card container for user queries
    '.group\\/user-message',
    // Query text within the conversation
    '[class*="UserMessage"]',
    '[class*="user-message"]',
    // Custom element / role fallback
    '[data-message-author-role="user"]',
    // Structural: text within a turn container attributed to the user
    '[aria-label*="You asked"]',
    '[aria-label*="Your question"]',
  ],
  responseSelectors: [
    // Primary answer block
    '[data-testid="answer"]',
    '.answer-content',
    // Perplexity's markdown prose block
    '.prose',
    '[class*="AnswerBody"]',
    '[class*="answer-body"]',
    // Generic model turn fallback
    '[data-message-author-role="assistant"]',
  ],
  // v1.4.0: multi-strategy selectors via resolver — survives platform UI updates
  inputSelectors: INPUT_SELECTOR_STRATEGIES.perplexity,
  sendButtonSelectors: [
    'button[aria-label="Submit"]',
    'button[aria-label="Send"]',
    'button[data-testid="send-button"]',
    // Icon button at the end of the textarea row
    'textarea ~ button',
    'button[type="submit"]',
  ],
};
