export const chatgpt = {
    name: "chatgpt",
    hostname: "chatgpt.com",
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
