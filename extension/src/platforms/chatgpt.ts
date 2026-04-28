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
  inputSelectors: [
    "#prompt-textarea",
    '[contenteditable="true"]',
  ],
  sendButtonSelectors: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
  ],
};