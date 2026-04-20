// Content script — runs inside Claude/ChatGPT/Gemini tabs
// Watches for AI responses and new chat events

type Platform = "claude" | "chatgpt" | "gemini" | "unknown";

function detectPlatform(): Platform {
  const host = window.location.hostname;
  if (host.includes("claude.ai")) return "claude";
  if (host.includes("chatgpt.com")) return "chatgpt";
  if (host.includes("gemini.google.com")) return "gemini";
  return "unknown";
}

function getResponseSelector(platform: Platform): string {
  switch (platform) {
    case "claude": return ".font-claude-message";
    case "chatgpt": return "[data-message-author-role='assistant']";
    case "gemini": return ".response-content";
    default: return "[data-message-author-role='assistant']";
  }
}

function getInputSelector(platform: Platform): string {
  switch (platform) {
    case "claude": return '[contenteditable="true"]';
    case "chatgpt": return "#prompt-textarea";
    case "gemini": return ".ql-editor";
    default: return "textarea";
  }
}

const platform = detectPlatform();
let lastObservedText = "";
let sessionId: string | null = null;
let isInjecting = false;

// Boot sequence
async function init() {
  console.log(`🔵 SYNQ active on: ${platform}`);

  // Load existing session
  const session = await getStoredSession();
  if (session) {
    sessionId = session.sessionId;
    console.log(`📦 SYNQ session loaded: ${session.projectName}`);
  }

  // Start watching the page
  observeResponses();
  watchForNewChat();
  injectSidebarUI();
}

// Watch for AI responses using MutationObserver
function observeResponses() {
  const selector = getResponseSelector(platform);

  const observer = new MutationObserver(() => {
    const responseBlocks = document.querySelectorAll(selector);
    if (responseBlocks.length === 0) return;

    const lastBlock = responseBlocks[responseBlocks.length - 1];
    const text = lastBlock.textContent?.trim() || "";

    // Only process if text is new and long enough to be meaningful
    if (text === lastObservedText || text.length < 100) return;

    // Wait for streaming to finish (no change for 2 seconds)
    debounceIngest(text);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

// Debounce so we wait for streaming to complete
let debounceTimer: ReturnType<typeof setTimeout>;
function debounceIngest(text: string) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (text === lastObservedText) return;
    lastObservedText = text;
    await ingestText(text);
  }, 2000); // 2s after last DOM change
}

// Send text to background → backend
async function ingestText(text: string) {
  if (!sessionId) {
    console.warn("SYNQ: No active session. Create one in the popup.");
    return;
  }

  console.log("🧠 SYNQ ingesting response...");
  const result = await sendMessage({
    type: "INGEST_TEXT",
    payload: { text, sessionId, platform },
  });

  if (result?.triplesExtracted) {
    console.log(`✅ SYNQ extracted ${result.triplesExtracted} triples`);
    showToast(`SYNQ captured ${result.triplesExtracted} facts`);
  }
}

// Detect when user opens a new chat
function watchForNewChat() {
  const observer = new MutationObserver(() => {
    const url = window.location.href;

    // Claude new chat URLs contain /new or have empty conversation
    const isNewChat =
      url.includes("/new") ||
      document.querySelectorAll(getResponseSelector(platform)).length === 0;

    if (isNewChat && sessionId && !isInjecting) {
      isInjecting = true;
      setTimeout(() => {
        injectContext();
        isInjecting = false;
      }, 1500); // wait for page to settle
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Fetch context and inject into the chat input
async function injectContext() {
  if (!sessionId) return;

  const data = await sendMessage({
    type: "GET_CONTEXT",
    payload: { sessionId },
  });

  if (!data?.contextBlock || data.tripleCount === 0) return;

  const prompt = buildContextPrompt(data.contextBlock);
  const inputSelector = getInputSelector(platform);
  const input = document.querySelector(inputSelector) as HTMLElement;

  if (!input) return;

  // Inject into the textarea
  input.focus();
  document.execCommand("insertText", false, prompt);

  showToast(`🧠 SYNQ injected ${data.tripleCount} facts into new chat`);
  console.log("✅ SYNQ context injected");
}

// Format the context block into a usable prompt
function buildContextPrompt(contextBlock: string): string {
  return `[SYNQ CONTEXT — Previous Session Knowledge]
The following facts were extracted from our previous conversations.
Use these as your working memory for this session:

${contextBlock}

[END SYNQ CONTEXT]
---
`;
}

// Inject a minimal sidebar UI via shadow DOM
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

  // Badge click opens popup
  shadow.getElementById("synq-badge")?.addEventListener("click", () => {
    showToast("Click the SYNQ extension icon to manage session");
  });

  // expose toast globally within this script
  (window as any).__synqShadow = shadow;
}

// Toast notification inside shadow DOM
function showToast(message: string) {
  const shadow = (window as any).__synqShadow;
  if (!shadow) return;
  const toast = shadow.getElementById("synq-toast") as HTMLElement;
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => (toast.style.opacity = "0"), 3000);
}

// Helper — message passing to background worker
function sendMessage(msg: object): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

async function getStoredSession() {
  return sendMessage({ type: "GET_SESSION" });
}
// Handle messages from popup directly
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CREATE_SESSION_FROM_POPUP") {
    sendMessage({
      type: "CREATE_SESSION",
      payload: message.payload,
    }).then((data) => {
      sessionId = data.sessionId;
      sendResponse(data);
    });
    return true;
  }

  if (message.type === "INJECT_NOW") {
    injectContext();
    sendResponse({ ok: true });
  }
});

init();