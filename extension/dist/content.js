"use strict";
// Content script — runs inside Claude/ChatGPT/Gemini tabs
function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("claude.ai"))
        return "claude";
    if (host.includes("chatgpt.com"))
        return "chatgpt";
    if (host.includes("gemini.google.com"))
        return "gemini";
    return "unknown";
}
function getResponseSelector(platform) {
    switch (platform) {
        case "claude": return ".font-claude-response";
        case "chatgpt": return "[data-message-author-role='assistant']";
        case "gemini": return ".response-content";
        default: return "[data-message-author-role='assistant']";
    }
}
function getInputSelector(platform) {
    switch (platform) {
        case "claude": return '[contenteditable="true"]';
        case "chatgpt": return "#prompt-textarea";
        case "gemini": return ".ql-editor";
        default: return "textarea";
    }
}
const platform = detectPlatform();
let sessionId = null;
async function init() {
    console.log(`🔵 SYNQ active on: ${platform}`);
    // Check if dashboard has set an active session via backend
    const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
    if (activeData?.activeSession) {
        sessionId = activeData.activeSession._id;
        console.log(`📦 SYNQ active session: ${activeData.activeSession.projectName}`);
    }
    else {
        // Fall back to chrome storage
        const session = await getStoredSession();
        if (session) {
            sessionId = session.sessionId;
            console.log(`📦 SYNQ session loaded: ${session.projectName}`);
        }
    }
    injectSidebarUI();
}
// Scrape ALL visible AI responses from current page at once
async function captureCurrentChat(projectName) {
    const selector = getResponseSelector(platform);
    const responseBlocks = document.querySelectorAll(selector);
    if (responseBlocks.length === 0) {
        return { success: false, triplesExtracted: 0, error: "No AI responses found on this page" };
    }
    // Combine all visible responses into one text
    const fullText = Array.from(responseBlocks)
        .map((el) => el.textContent?.trim() || "")
        .filter((t) => t.length > 50)
        .join("\n\n---\n\n");
    if (!fullText) {
        return { success: false, triplesExtracted: 0, error: "No meaningful content found" };
    }
    console.log(`🧠 SYNQ capturing ${responseBlocks.length} responses...`);
    // Step 1 — create session
    const sessionData = await sendMessage({
        type: "CREATE_SESSION",
        payload: { projectName, platform },
    });
    if (!sessionData?.sessionId) {
        return { success: false, triplesExtracted: 0, error: "Failed to create session" };
    }
    sessionId = sessionData.sessionId;
    // Step 2 — ingest the full text
    const result = await sendMessage({
        type: "INGEST_TEXT",
        payload: { text: fullText, sessionId, platform },
    });
    const count = result?.triplesExtracted || 0;
    console.log(`✅ SYNQ captured ${count} triples`);
    showToast(`✅ Captured ${count} facts from this chat`);
    return { success: true, triplesExtracted: count, sessionId: sessionId ?? undefined };
}
// Inject stored context into current chat input manually
async function injectContext() {
    if (!sessionId) {
        showToast("⚠ No session loaded. Capture a chat first.");
        return;
    }
    const data = await sendMessage({
        type: "GET_CONTEXT",
        payload: { sessionId },
    });
    if (!data?.contextBlock || data.tripleCount === 0) {
        showToast("⚠ No context found for this session.");
        return;
    }
    const prompt = buildContextPrompt(data.contextBlock);
    const inputSelector = getInputSelector(platform);
    const input = document.querySelector(inputSelector);
    if (!input) {
        showToast("⚠ Could not find chat input.");
        return;
    }
    input.focus();
    document.execCommand("insertText", false, prompt);
    showToast(`🧠 Injected ${data.tripleCount} facts into chat`);
    console.log("✅ SYNQ context injected");
}
function buildContextPrompt(contextBlock) {
    return `[SYNQ CONTEXT — Previous Session Knowledge]
The following facts were extracted from our previous conversations.
Use these as your working memory for this session:

${contextBlock}

[END SYNQ CONTEXT]
---
`;
}
// Inject badge UI via shadow DOM
function injectSidebarUI() {
    const host = document.createElement("div");
    host.id = "synq-sidebar-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
    <style>
      #synq-badge {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #6366f1;
        color: white;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 13px;
        font-family: monospace;
        cursor: pointer;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: background 0.2s;
      }
      #synq-badge:hover { background: #4f46e5; }
      #synq-toast {
        position: fixed;
        bottom: 70px;
        right: 24px;
        background: #1e1e2e;
        color: #a6e3a1;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-family: monospace;
        z-index: 999999;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
      }
    </style>
    <div id="synq-badge">⚡ SYNQ</div>
    <div id="synq-toast"></div>
  `;
    shadow.getElementById("synq-badge")?.addEventListener("click", () => {
        showToast("Click the SYNQ extension icon to manage session");
    });
    window.__synqShadow = shadow;
}
function showToast(message) {
    const shadow = window.__synqShadow;
    if (!shadow)
        return;
    const toast = shadow.getElementById("synq-toast");
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => (toast.style.opacity = "0"), 3000);
}
function sendMessage(msg) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(msg, resolve);
    });
}
async function getStoredSession() {
    return sendMessage({ type: "GET_SESSION" });
}
// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CAPTURE_CHAT") {
        captureCurrentChat(message.payload.projectName).then((result) => {
            sendResponse(result);
        });
        return true;
    }
    if (message.type === "INJECT_NOW") {
        injectContext().then(() => sendResponse({ ok: true }));
        return true;
    }
});
init();
