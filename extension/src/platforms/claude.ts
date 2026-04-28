export const claude = {
  name: "claude" as const,
  hostname: "claude.ai",
  userSelectors: [
    '.font-user-message',
    '[data-testid="user-message"]',
    '.human-turn',
    '.HumanTurn',
  ],
  responseSelectors: [
    // Confirmed from live DOM inspection (April 2025)
    '.font-claude-response',           // inner content wrapper — confirmed present
    '[data-is-streaming]',             // response container (streaming + done)
  ],
  inputSelectors: [
    // ProseMirror confirmed in DOM (BR.ProseMirror-trailingBreak visible)
    'div.ProseMirror',
    '[contenteditable="true"][data-placeholder]',
    '[contenteditable="true"]',
  ],
  sendButtonSelectors: [
    'button[aria-label="Send Message"]',
    'button[aria-label="Send message"]',
    'button[data-testid="send-button"]',
    'button[type="submit"]',
  ],
};