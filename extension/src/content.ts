// Content script — runs inside Claude/ChatGPT/Gemini tabs

type Platform = "claude" | "chatgpt" | "gemini" | "unknown";

function detectPlatform(): Platform {
  const host = window.location.hostname;
  if (host.includes("claude.ai")) return "claude";
  if (host.includes("chatgpt.com")) return "chatgpt";
  if (host.includes("gemini.google.com")) return "gemini";
  return "unknown";
}

// Multiple selectors per platform, tried in order.
// If Claude/ChatGPT update their UI, add the new selector at the TOP of the array
// and open a PR — the old one stays as fallback.
function getResponseSelectors(platform: Platform): string[] {
  switch (platform) {
    case "claude":
      return [
        ".font-claude-response",            // current (as of mid-2025)
        "[data-is-streaming]",              // fallback attribute
        ".prose",                           // broad fallback
      ];
    case "chatgpt":
      return [
        "[data-message-author-role='assistant']",
        ".markdown.prose",
        ".agent-turn",
      ];
    case "gemini":
      return [
        ".response-content",
        "model-response",
        ".model-response-text",
      ];
    default:
      return ["[data-message-author-role='assistant']"];
  }
}

function getInputSelectors(platform: Platform): string[] {
  switch (platform) {
    case "claude":
      return ['[contenteditable="true"][data-placeholder]', '[contenteditable="true"]'];
    case "chatgpt":
      return ["#prompt-textarea", '[contenteditable="true"]'];
    case "gemini":
      return [".ql-editor", '[contenteditable="true"]'];
    default:
      return ["textarea", '[contenteditable="true"]'];
  }
}

// Try each selector in order, return the first one that finds elements
function queryAll(selectors: string[]): NodeListOf<Element> | Element[] {
  for (const sel of selectors) {
    try {
      const results = document.querySelectorAll(sel);
      if (results.length > 0) return results;
    } catch {
      // Invalid selector — skip
    }
  }
  return [];
}

function queryOne(selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const result = document.querySelector(sel);
      if (result) return result;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

const platform = detectPlatform();
let sessionId: string | null = null;

async function init() {
  console.log(`🔵 SYNQ active on: ${platform}`);

  const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
  if (activeData?.activeSession) {
    sessionId = activeData.activeSession._id;
    console.log(`📦 SYNQ active session: ${activeData.activeSession.projectName}`);
  } else {
    const session = await getStoredSession();
    if (session) {
      sessionId = session.sessionId;
      console.log(`📦 SYNQ session loaded: ${session.projectName}`);
    }
  }

  injectSidebarUI();
}

async function captureCurrentChat(projectName: string): Promise<{
  success: boolean;
  triplesExtracted: number;
  sessionId?: string;
  error?: string;
}> {
  const selectors = getResponseSelectors(platform);
  const responseBlocks = queryAll(selectors);

  if (responseBlocks.length === 0) {
    const tried = selectors.join(", ");
    console.warn(`SYNQ: No AI responses found. Tried selectors: ${tried}`);
    return {
      success: false,
      triplesExtracted: 0,
      error: `No AI responses found on this page. The platform's UI may have updated — please open an issue at github.com/Eshaan-Nair/Synq`,
    };
  }

  const fullText = Array.from(responseBlocks)
    .map((el) => el.textContent?.trim() || "")
    .filter((t) => t.length > 50)
    .join("\n\n---\n\n");

  if (!fullText) {
    return { success: false, triplesExtracted: 0, error: "No meaningful content found" };
  }

  console.log(`🧠 SYNQ capturing ${responseBlocks.length} responses...`);

  const sessionData = await sendMessage({
    type: "CREATE_SESSION",
    payload: { projectName, platform },
  });

  if (!sessionData?.sessionId) {
    return { success: false, triplesExtracted: 0, error: "Failed to create session. Is the backend running on port 3001?" };
  }

  sessionId = sessionData.sessionId;

  const result = await sendMessage({
    type: "INGEST_TEXT",
    payload: { text: fullText, sessionId, platform },
  });

  const count = result?.triplesExtracted || 0;
  console.log(`✅ SYNQ captured ${count} triples`);
  showToast(`✅ Captured ${count} facts from this chat`);

  return { success: true, triplesExtracted: count, sessionId: sessionId ?? undefined };
}

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

  const prompt = buildContextPrompt(data);
  const inputSelectors = getInputSelectors(platform);
  const input = queryOne(inputSelectors) as HTMLElement | null;

  if (!input) {
    showToast("⚠ Could not find chat input. Try clicking the input box first.");
    return;
  }

  input.focus();

  // Use modern input event dispatch instead of deprecated execCommand
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLElement.prototype,
    "textContent"
  );

  if (input.isContentEditable) {
    // For contenteditable divs (Claude, Gemini)
    input.textContent = prompt;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // For textarea (ChatGPT fallback)
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    );
    if (nativeSetter?.set) {
      nativeSetter.set.call(input, prompt);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  showToast(`🧠 Injected ${data.tripleCount} facts into chat`);
  console.log("✅ SYNQ context injected");
}

function buildContextPrompt(data: {
  contextBlock: string;
  structuredSummary?: string;
  tripleCount: number;
}): string {
  const content = data.structuredSummary || data.contextBlock;
  return `[SYNQ CONTEXT — Previous Session Knowledge]
You have worked on this project before. Here is what was discussed:

${content}

Use this as your working memory. Do not re-explain things already established.
[END SYNQ CONTEXT]
---
`;
}

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
      background: #00A896;
      color: #021f2e;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-family: 'Courier New', monospace;
      font-weight: 700;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 4px 16px rgba(2, 195, 154, 0.4);
      letter-spacing: 0.05em;
      transition: background 0.2s;
    }
    #synq-badge:hover { background: #02C39A; }
    #synq-toast {
      position: fixed;
      bottom: 70px;
      right: 24px;
      background: #032a3d;
      color: #F0F3BD;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-family: 'Courier New', monospace;
      z-index: 999999;
      opacity: 0;
      border: 1px solid #04445e;
      transition: opacity 0.3s;
      pointer-events: none;
      max-width: 280px;
    }
  </style>
  <div id="synq-badge">⚡ SYNQ</div>
  <div id="synq-toast"></div>
`;

  shadow.getElementById("synq-badge")?.addEventListener("click", () => {
    showToast("Click the SYNQ extension icon to manage session");
  });

  (window as any).__synqShadow = shadow;
}

function showToast(message: string) {
  const shadow = (window as any).__synqShadow;
  if (!shadow) return;
  const toast = shadow.getElementById("synq-toast") as HTMLElement;
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => (toast.style.opacity = "0"), 4000);
}

function sendMessage(msg: object): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

async function getStoredSession() {
  return sendMessage({ type: "GET_SESSION" });
}

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