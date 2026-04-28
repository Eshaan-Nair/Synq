export const gemini = {
    name: "gemini",
    hostname: "gemini.google.com",
    responseSelectors: [
        ".response-content",
        "model-response",
        ".model-response-text",
    ],
    inputSelectors: [
        ".ql-editor",
        '[contenteditable="true"]',
    ],
    sendButtonSelectors: [
        'button[aria-label="Send message"]',
        ".send-button",
    ],
};
