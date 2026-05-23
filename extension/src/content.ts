/**
 * ArcRift content.ts — v1.5.2
 *
 * feat: Selector failure detection — reports stale input selectors to popup.
 * 
 * Note: Use execCommand("insertText") which triggers the browser's native
 * input pipeline and is correctly intercepted by all frameworks. Fall back
 * to clipboard paste simulation if execCommand is unavailable.
 */

import {
  detectPlatform,
  getPlatformConfig,
  queryAll,
  queryOne,
  type Platform,
} from "./platforms/index";

// ── Already-initialised guard ────────────────────────────────────
if ((window as any).__arcriftInitialised) {
  // Throwing at module level halts script execution — this is the correct
  // pattern for content scripts. The extension runtime catches it; it does
  // NOT crash the page. The IIFE approach used previously was a no-op that
  // failed to stop the rest of the script from running.
  throw new Error("[ArcRift] Duplicate injection detected — skipping re-initialisation.");
}
(window as any).__arcriftInitialised = true;

// ── State ────────────────────────────────────────────────────────
let platform: Platform = detectPlatform();
let config = getPlatformConfig(platform);
let sessionId: string | null = null;
let isPaused: boolean = false;
let isProcessingPrompt = false;
let lastSendTimestamp = 0;

let arcriftShadow: ShadowRoot | null = null;
let urlWatcherInterval: ReturnType<typeof setInterval> | null = null;

const seenMessageFingerprints = new Set<string>();

const ARCRIFT_DEBUG = (window as any).__ARCRIFT_debug === true;
const log = {
  info: (...args: any[]) => ARCRIFT_DEBUG && console.log("[ArcRift]", ...args),
  warn: (...args: any[]) => console.warn("[ArcRift]", ...args),
  error: (...args: any[]) => console.error("[ArcRift]", ...args),
};

// ── FNV-1a hash fingerprint ──────────────────────────────────────
function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}
function fingerprint(text: string): string { return fnv1a(text.trim()); }

// Add a fingerprint, but cap the set at 1000 entries to prevent unbounded
// memory growth during very long sessions where the user never re-saves.
function addFingerprint(fp: string): void {
  if (seenMessageFingerprints.size >= 1000) {
    seenMessageFingerprints.clear();
  }
  seenMessageFingerprints.add(fp);
}

// ── Boot ─────────────────────────────────────────────────────────
function getSmartUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    if (host === "chatgpt.com" && u.pathname.startsWith("/c/")) return host + u.pathname.split("/").slice(0, 3).join("/");
    if (host === "claude.ai" && u.pathname.startsWith("/chat/")) return host + u.pathname.split("/").slice(0, 3).join("/");
    if (host === "gemini.google.com" && u.pathname.startsWith("/app/")) return host + u.pathname.split("/").slice(0, 3).join("/");
    if (host === "chat.deepseek.com" && u.pathname.startsWith("/a/chat/s/")) return host + u.pathname.split("/").slice(0, 5).join("/");
    return host + u.pathname.replace(/\/$/, "");
  } catch (e) { return url; }
}

let lastSmartKey = getSmartUrlKey(window.location.href);

function handleUrlChange() {
  const newPlatform = detectPlatform();
  const newSmartKey = getSmartUrlKey(window.location.href);
  
  if (newPlatform !== platform) {
    log.info(`[ArcRift] platform changed: ${platform} → ${newPlatform}`);
    detachPromptInterceptor();
    platform = newPlatform;
    config = getPlatformConfig(newPlatform);
    if (platform !== "unknown" && config) {
      if (!arcriftShadow) injectSidebarUI();
      if (!isPaused && sessionId) attachPromptInterceptor();
      updateBadge(!isPaused && !!sessionId);
    }
  }

  if (newSmartKey !== lastSmartKey) {
    log.info(`[ArcRift] Chat ID changed: ${lastSmartKey} → ${newSmartKey}`);
    lastSmartKey = newSmartKey;
    
    sendMessage({ type: "GET_ACTIVE_SESSION" }).then(activeData => {
      if (activeData?.activeSession) {
        sessionId = activeData.activeSession._id as string;
        updateBadge(!isPaused && !!sessionId);
        log.info(`[ArcRift] Sync: URL belongs to session ${activeData.activeSession.projectName}`);
      } else {
        sessionId = null;
        updateBadge(false);
        log.info("[ArcRift] Sync: New Chat URL detected, session cleared.");
      }
    });
  }
}

async function init() {
  seenMessageFingerprints.clear();
  log.info(`[ArcRift] v1.5.2 active on: ${platform}`);

  const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
  if (activeData?.activeSession) {
    sessionId = activeData.activeSession._id as string;
  }

  const pauseData = await sendMessage({ type: "GET_PAUSE_STATE" });
  isPaused = pauseData?.paused === true;

  if (sessionId && config && !isPaused) {
    attachPromptInterceptor();
    log.info(`[ArcRift] auto-connected for session ${sessionId}`);
  }

  if (platform !== "unknown" && config) {
    injectSidebarUI();
    updateBadge(!isPaused && !!sessionId);
  }

  // Watch for SPA URL changes
  if (urlWatcherInterval !== null) clearInterval(urlWatcherInterval);
  let lastHref = window.location.href;
  urlWatcherInterval = setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      handleUrlChange();
    }
  }, 1000);
  window.addEventListener("popstate", handleUrlChange);
}

// Kick off
init();

// ── Chat save ─────────────────────────────────────────────────────
async function saveCurrentChat(projectName: string, providedSessionId?: string): Promise<{
  success: boolean;
  topicsExtracted: number;
  triplesExtracted: number;
  sessionId?: string;
  error?: string;
}> {
  if (!config) {
    return { success: false, topicsExtracted: 0, triplesExtracted: 0, error: "Unsupported platform" };
  }

  let userEls = queryAll(config.userSelectors);
  const assistantEls = queryAll(config.responseSelectors);
  log.info(`[ArcRift] scrape: ${userEls.length} user els, ${assistantEls.length} assistant els (platform: ${platform})`);

  if (userEls.length === 0 && assistantEls.length > 0) {
    log.info("[ArcRift] user selectors returned 0 — trying structural fallback");
    const foundUserEls: Element[] = [];
    for (const assistantEl of assistantEls) {
      let parent = assistantEl.parentElement;
      for (let depth = 0; depth < 5 && parent; depth++) {
        const prev = parent.previousElementSibling;
        if (prev) {
          const prevText = prev.textContent?.trim() || "";
          if (prevText.length > 2 && prevText.length < 5000 && !assistantEls.some(a => a === prev || a.contains(prev) || prev.contains(a))) {
            foundUserEls.push(prev);
            break;
          }
        }
        parent = parent.parentElement;
      }
    }
    if (foundUserEls.length > 0) {
      userEls = foundUserEls;
      log.info(`[ArcRift] structural fallback found ${userEls.length} user element(s)`);
    }
  }

  if (userEls.length === 0) {
    const broadSelectors = [
      '[role="row"]',
      '[data-turn-role="user"]',
      '[aria-label*="You"]',
      '[aria-label*="your prompt"]',
      '[aria-label*="your message"]',
    ];
    for (const sel of broadSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          userEls = Array.from(els);
          log.info(`[ArcRift] broad selector "${sel}" found ${userEls.length} user element(s)`);
          break;
        }
      } catch { /* invalid selector */ }
    }
  }

  if (assistantEls.length === 0 && userEls.length === 0) {
    return {
      success: false, topicsExtracted: 0, triplesExtracted: 0,
      error: `No messages found on ${platform}. Make sure you're on a chat page with visible messages.`,
    };
  }

  type TaggedEl = { el: Element; role: "user" | "assistant" };
  const tagged: TaggedEl[] = [
    ...userEls.map(el => ({ el, role: "user" as const })),
    ...assistantEls.map(el => ({ el, role: "assistant" as const })),
  ];
  tagged.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const lines: string[] = [];
  for (const { el, role } of tagged) {
    let text = el.textContent?.trim() || "";
    if (text.length < 3) continue;
    // Strip platform-injected prefixes (Gemini wraps messages with "You said" / "Gemini said")
    text = text
      .replace(/^You said\s*/i, "")
      .replace(/^Gemini said\s*/i, "")
      .replace(/^ChatGPT said\s*/i, "")
      .replace(/^Claude said\s*/i, "")
      .replace(/^DeepSeek said\s*/i, "")
      .trim();
    if (text.length < 3) continue;
    const fp = fingerprint(text);
    if (seenMessageFingerprints.has(fp)) continue;
    addFingerprint(fp);
    lines.push(`[${role === "user" ? "User" : "Assistant"}]: ${text}`);
  }

  if (lines.length === 0) {
    return { success: false, topicsExtracted: 0, triplesExtracted: 0, error: "No new content to save (already saved)" };
  }

  const rawText = lines.join("\n\n");
  log.info(`[ArcRift] saving ${rawText.length} chars, ${lines.length} turns...`);
  showToast("Saving chat...");

  let saveSessionId = providedSessionId;
  if (!saveSessionId) {
    const sessionData = await sendMessage({
      type: "CREATE_SESSION",
      payload: { projectName, platform },
    });
    if (!sessionData?.sessionId) {
      return {
        success: false, topicsExtracted: 0, triplesExtracted: 0,
        error: "Failed to create session. Is the backend running on port 3001?",
      };
    }
    saveSessionId = sessionData.sessionId as string;
  }

  sessionId = saveSessionId;

  const result = await sendMessage({
    type: "SAVE_CHAT",
    payload: { rawText, sessionId: saveSessionId, platform, messageCount: lines.length },
  });

  if (result?.error) {
    return { success: false, topicsExtracted: 0, triplesExtracted: 0, error: result.error as string };
  }

  const chunksStored = (result?.chunksStored || result?.topicsExtracted || 0) as number;
  const triplesExtracted = (result?.triplesExtracted || 0) as number;

  if (!isPaused && config) {
    attachPromptInterceptor();
    updateBadge(true);
    showToast(`Saved! ${chunksStored} chunks, ${triplesExtracted} facts. ArcRift is active.`);
  } else {
    showToast(`Saved! ${chunksStored} chunks, ${triplesExtracted} facts.`);
  }

  return { success: true, topicsExtracted: chunksStored, triplesExtracted, sessionId: saveSessionId ?? undefined };
}

// ── Interceptor ───────────────────────────────────────────────────
function attachPromptInterceptor() {
  if (!config) return;
  document.addEventListener("keydown", handlePromptKeydown, true);
  document.addEventListener("click", handleSendButtonClick, true);
  log.info("[ArcRift] interceptor attached");
}

function detachPromptInterceptor() {
  document.removeEventListener("keydown", handlePromptKeydown, true);
  document.removeEventListener("click", handleSendButtonClick, true);
  log.info("[ArcRift] interceptor detached");
}

async function handlePromptKeydown(e: KeyboardEvent) {
  if (isPaused || isProcessingPrompt || !config || !sessionId) return;
  if (e.key !== "Enter" || e.shiftKey) return;
  const now = Date.now();
  if (now - lastSendTimestamp < 300) return;
  const input = queryOne(config.inputSelectors);
  if (!input) {
    reportSelectorFailure();
    return;
  }
  if (!document.activeElement?.closest(config.inputSelectors.join(","))) return;
  const promptText = input.textContent?.trim() || (input as HTMLTextAreaElement).value?.trim() || "";
  if (!promptText || promptText.length < 5) return;
  lastSendTimestamp = now;
  e.preventDefault();
  e.stopPropagation();
  await processPromptWithRAG(promptText, input as HTMLElement);
}

async function handleSendButtonClick(e: MouseEvent) {
  if (isPaused || isProcessingPrompt || !config || !sessionId) return;
  const target = e.target as Element;
  const isSendButton = config.sendButtonSelectors.some(sel => target.closest(sel));
  if (!isSendButton) return;
  const now = Date.now();
  if (now - lastSendTimestamp < 300) return;
  const input = queryOne(config.inputSelectors);
  if (!input) {
    reportSelectorFailure();
    return;
  }
  const promptText = input.textContent?.trim() || (input as HTMLTextAreaElement).value?.trim() || "";
  if (!promptText || promptText.length < 5) return;
  lastSendTimestamp = now;
  e.preventDefault();
  e.stopPropagation();
  await processPromptWithRAG(promptText, input as HTMLElement);
}

async function processPromptWithRAG(promptText: string, input: HTMLElement) {
  isProcessingPrompt = true;
  showToast("ArcRift searching memory...");
  try {
    // Always fetch the current active session — the cached sessionId may be stale
    // if the user saved a new session from a different tab since this tab was opened.
    const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
    const currentSessionId = (activeData?.activeSession?._id as string) || sessionId;
    if (!currentSessionId) {
      await injectAndSend(input, promptText);
      showToast("No session — save a chat first");
      return;
    }
    // Keep local cache in sync
    if (currentSessionId !== sessionId) {
      log.info(`[ArcRift] session refreshed: ${sessionId} → ${currentSessionId}`);
      sessionId = currentSessionId;
    }

    const result = await sendMessage({
      type: "RAG_RETRIEVE",
      payload: { prompt: promptText, sessionId: currentSessionId, topN: 3 },
    });
    if (result?.found && result?.contextBlock) {
      const contextualPrompt = buildRAGPrompt(result.contextBlock, promptText);
      await injectAndSend(input, contextualPrompt);
      const count = result?.chunksFound?.length ?? result?.chunks?.length ?? 0;
      showToast(`ArcRift recalled ${count} context chunk(s)`);
    } else {
      // Fallback: search globally if session search failed
      const globalResult = await sendMessage({
        type: "RAG_RETRIEVE_GLOBAL",
        payload: { prompt: promptText, topN: 2 },
      });
      if (globalResult?.found && globalResult?.contextBlock) {
        await injectAndSend(input, globalResult.contextBlock + "\n\n" + promptText);
        showToast("ArcRift recalled cross-project context");
      } else {
        await injectAndSend(input, promptText);
        showToast("No matching context — sending normally");
      }
    }
  } catch (err: any) {
    console.error("[ArcRift] RAG error:", err);
    const isInvalidated = err?.message?.includes("Extension context invalidated") ||
      err?.message?.includes("context invalidated");
    if (isInvalidated) {
      showToast("ArcRift disconnected — refresh page to reconnect");
      // Don't try to injectAndSend — the extension context is gone,
      // the page will send the prompt on its own when the user retries.
    } else {
      showToast("ArcRift error — sending normally");
      await injectAndSend(input, promptText);
    }
  } finally {
    isProcessingPrompt = false;
  }
}

function buildRAGPrompt(contextBlock: string, userPrompt: string): string {
  return `[MEMORY ACCESS: PREVIOUS SESSION DATA ACQUIRED]
The following information is retrieved from your memory of a past conversation with this user. Treat this as VERIFIED FACTUAL CONTEXT for the current conversation.

${contextBlock}
[END MEMORY ACCESS]

User Prompt: ${userPrompt}`;
}

// ── Injection (Fixed) ────────────────────────────────────────────
//
// PROBLEM: The old approach set input.textContent = "" then dispatched a
// "beforeinput" event. React (ChatGPT) and Angular/custom elements (Gemini)
// manage input state internally — they intercept DOM mutations but do NOT
// respond to synthetic InputEvents created by scripts. The result was that
// the input appeared filled but React's state was still "", so on submit the
// AI received a blank message.
//
// FIX: Use document.execCommand("insertText") which goes through the browser's
// native editing pipeline. All frameworks hook into this correctly because it
// triggers the same code path as actual typing. We:
//   1. Focus the input
//   2. Select all existing text (to replace it)
//   3. execCommand("insertText", false, newText)
//
// For <textarea> elements (not contenteditable), we use the native value
// setter trick which still works fine.
//
async function injectAndSend(input: HTMLElement, text: string) {
  input.focus();
  const currentText = input.textContent?.trim() || (input as HTMLTextAreaElement).value?.trim() || "";
  if (currentText === text.trim()) {
    // Already injected — just send
  } else if (input.isContentEditable) {
    // Strategy 1: InputEvent (React/Angular compliant — modern standard)
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const evt = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: text,
      bubbles: true,
      cancelable: true,
    });
    const cancelled = !input.dispatchEvent(evt);

    // Strategy 2: If InputEvent didn't take hold, use direct DOM mutation as fallback
    if (!cancelled && input.textContent !== text) {
      input.textContent = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } else {
    // <textarea>: native setter (bypasses React's readonly descriptor)
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    );
    if (nativeSetter?.set) {
      nativeSetter.set.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  await new Promise(r => setTimeout(r, 300));

  const sendBtn = queryOne(config!.sendButtonSelectors) as HTMLElement | null;
  if (sendBtn) {
    sendBtn.focus();
    sendBtn.click();
  } else {
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", keyCode: 13, which: 13,
      bubbles: true, cancelable: true,
    }));
  }
}


// ── One-time inject ───────────────────────────────────────────────
async function injectContext() {
  if (!sessionId) { showToast("No session loaded. Save a chat first."); return; }
  if (!config) { showToast("Unsupported platform."); return; }
  const data = await sendMessage({ type: "GET_CONTEXT", payload: { sessionId } });
  if (!data?.contextBlock || data.tripleCount === 0) { showToast("No context found."); return; }
  const prompt = `[ArcRift CONTEXT — Previous Session Knowledge]\n${data.structuredSummary || data.contextBlock}\n[END ArcRift CONTEXT]\n---\n`;
  const input = queryOne(config.inputSelectors) as HTMLElement | null;
  if (!input) { showToast("Could not find chat input. Click the input box first."); return; }

  input.focus();

  if (input.isContentEditable) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const evt = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: prompt,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(evt);

    if (input.textContent !== prompt) {
      document.execCommand("insertText", false, prompt);
    }
    if (input.textContent !== prompt) {
      input.innerText = prompt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } else {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (nativeSetter?.set) {
      nativeSetter.set.call(input, prompt);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  showToast(`Injected ${data.tripleCount} facts into chat`);
}

// ── Sidebar badge + toast ────────────────────────────────────────
function injectSidebarUI() {
  if (document.getElementById("ArcRift-sidebar-host")) return;
  const host = document.createElement("div");
  host.id = "ArcRift-sidebar-host";
  // Ensure the host creates a top-level stacking context and doesn't block clicks globally
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "100%";
  host.style.height = "100%";
  host.style.zIndex = "2147483647"; // Max z-index
  host.style.pointerEvents = "none"; // Let clicks pass through the invisible host wrapper
  document.body.appendChild(host);
  arcriftShadow = host.attachShadow({ mode: "open" });
  arcriftShadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600&display=swap');
    
    #ArcRift-badge {
      position: absolute; bottom: 24px; right: 24px;
      background: rgba(15, 18, 26, 0.8);
      backdrop-filter: blur(12px);
      color: #F8FAFC;
      padding: 8px 16px; border-radius: 100px;
      font-size: 11px; font-family: 'Outfit', system-ui, sans-serif;
      font-weight: 600; cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.1);
      pointer-events: auto;
      display: flex; align-items: center; gap: 8px;
      letter-spacing: 0.08em; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      user-select: none;
    }
    #ArcRift-badge:hover { 
      transform: translateY(-2px) scale(1.02);
      border-color: rgba(129, 140, 248, 0.5);
      background: rgba(25, 28, 38, 0.9);
    }
    #ArcRift-badge .status-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #475569; transition: all 0.3s;
      box-shadow: 0 0 0 rgba(129, 140, 248, 0);
    }
    #ArcRift-badge.active {
      border-color: rgba(129, 140, 248, 0.6);
      box-shadow: 0 0 20px rgba(129, 140, 248, 0.15), 0 4px 12px rgba(0,0,0,0.3);
    }
    #ArcRift-badge.active .status-dot {
      background: #818CF8;
      box-shadow: 0 0 8px #818CF8;
      animation: pulse 2s infinite;
    }
    #ArcRift-badge.paused { color: #64748b; opacity: 0.8; }
    #ArcRift-badge.paused .status-dot { background: #334155; }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(129, 140, 248, 0); }
      100% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0); }
    }

    #ArcRift-toast {
      position: absolute; bottom: 76px; right: 24px;
      background: #0B0E14; color: #F1F5F9;
      padding: 10px 16px; border-radius: 8px;
      font-size: 12px; font-family: 'Outfit', system-ui, sans-serif;
      opacity: 0; transform: translateY(10px);
      border: 1px solid rgba(129, 140, 248, 0.3); 
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none; max-width: 280px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    #ArcRift-toast.show { opacity: 1; transform: translateY(0); }
  </style>
  <div id="ArcRift-badge"><div class="status-dot"></div><span>ArcRift</span></div>
  <div id="ArcRift-toast"></div>
  `;

  arcriftShadow.getElementById("ArcRift-badge")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_PAUSE" });
  });
}

function updateBadge(active: boolean) {
  if (!arcriftShadow) return;
  const badge = arcriftShadow.getElementById("ArcRift-badge") as HTMLElement;
  const label = badge?.querySelector("span");
  const dot = badge?.querySelector(".status-dot") as HTMLElement;
  if (!badge || !label || !dot) return;

  badge.classList.remove("active", "paused");

  if (isPaused) {
    label.textContent = "ArcRift OFF";
    badge.classList.add("paused");
  } else if (active || !!sessionId) {
    label.textContent = "ArcRift ON";
    badge.classList.add("active");
  } else {
    label.textContent = "arcrift";
  }
}

function showToast(message: string) {
  if (!arcriftShadow) return;
  const toast = arcriftShadow.getElementById("ArcRift-toast") as HTMLElement;
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 4000);
}

// ── Selector failure reporting ─────────────────────────────────────
let _selectorFailureReported = false;
function reportSelectorFailure() {
  if (_selectorFailureReported) return; // Only report once per page load
  _selectorFailureReported = true;
  log.warn(`[ArcRift] Input selector not found on ${platform}. Reporting failure to popup.`);
  chrome.runtime.sendMessage({
    type: "REPORT_SELECTOR_FAILURE",
    payload: { platform },
  }).catch(() => {});
}

// ── Messaging ─────────────────────────────────────────────────────
function sendMessage(msg: object): Promise<any> {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}
async function getStoredSession() { return sendMessage({ type: "GET_SESSION" }); }

// ── Message listener ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "SAVE_CHAT_FROM_POPUP") {
    seenMessageFingerprints.clear();
    const pl = message.payload as { projectName: string; sessionId?: string };
    saveCurrentChat(pl.projectName, pl.sessionId).then(sendResponse);
    return true;
  }
  if (message.type === "INJECT_NOW") {
    injectContext().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "PAUSE_ARCRIFT") {
    isPaused = true;
    detachPromptInterceptor();
    updateBadge(false);
    showToast("ArcRift paused — context injection suspended");
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "RESUME_ARCRIFT") {
    isPaused = false;
    if (sessionId && config) {
      attachPromptInterceptor();
      updateBadge(true);
      showToast("ArcRift resumed — context injection active");
    } else {
      updateBadge(false);
      showToast("ArcRift resumed — waiting for session");
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "SESSION_CHANGED") {
    // Background broadcast: a new session was saved (or session was unloaded).
    const { sessionId: newId, projectName } = message.payload as { sessionId: string | null; projectName?: string };

    if (newId === null) {
      log.info("[ArcRift] session unloaded via broadcast");
      sessionId = null;
      detachPromptInterceptor();
      updateBadge(false);
      showToast("ArcRift: session unloaded");
    } else {
      log.info(`[ArcRift] session updated via broadcast: ${sessionId} → ${newId} (${projectName})`);
      sessionId = newId;
      if (config && !isPaused) {
        attachPromptInterceptor();
        updateBadge(true);
      } else {
        updateBadge(false);
      }
      if (projectName) {
        showToast(`ArcRift: session updated to "${projectName}"`);
      }
    }
    sendResponse({ ok: true });
    return true;
  }
});

init();
