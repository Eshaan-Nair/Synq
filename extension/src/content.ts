/**
 * SYNQ content.ts — v1.3
 *
 * Fix: Context injection now works reliably on all platforms.
 *
 * Root cause: The previous injectAndSend() cleared input.textContent = ""
 * then dispatched a "beforeinput" event. React/framework-controlled inputs
 * (ChatGPT uses React, Gemini uses Angular/custom elements) intercept DOM
 * mutations and reset the value back to "" because no React state was updated.
 * The prompt was lost and the AI received an empty message.
 *
 * Fix: Use execCommand("insertText") which triggers the browser's native
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
if ((window as any).__synqInitialised) {
  // Throwing at module level halts script execution — this is the correct
  // pattern for content scripts. The extension runtime catches it; it does
  // NOT crash the page. The IIFE approach used previously was a no-op that
  // failed to stop the rest of the script from running.
  throw new Error("[SYNQ] Duplicate injection detected — skipping re-initialisation.");
}
(window as any).__synqInitialised = true;

// ── State ────────────────────────────────────────────────────────
let platform: Platform = detectPlatform();
let config = getPlatformConfig(platform);
let sessionId: string | null = null;
let isPaused: boolean = false;
let isProcessingPrompt = false;
let lastSendTimestamp = 0;

let synqShadow: ShadowRoot | null = null;
let urlWatcherInterval: ReturnType<typeof setInterval> | null = null;

const seenMessageFingerprints = new Set<string>();

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
async function init() {
  // Clear fingerprint cache on every init (new page / URL navigation)
  // so fresh chats are never incorrectly marked as "already saved".
  seenMessageFingerprints.clear();
  console.log(`[SYNQ] active on: ${platform}`);

  const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
  if (activeData?.activeSession) {
    sessionId = activeData.activeSession._id as string;
    console.log(`[SYNQ] session: ${activeData.activeSession.projectName}`);
  } else {
    const stored = await getStoredSession();
    if (stored) {
      sessionId = stored.sessionId as string;
      console.log(`[SYNQ] session (stored): ${stored.projectName}`);
    }
  }

  const pauseData = await sendMessage({ type: "GET_PAUSE_STATE" });
  isPaused = pauseData?.paused === true;

  if (sessionId && config && !isPaused) {
    attachPromptInterceptor();
    console.log(`[SYNQ] auto-connected for session ${sessionId}`);
  }

  injectSidebarUI();
  updateBadge(!isPaused && !!sessionId);

  if (urlWatcherInterval !== null) clearInterval(urlWatcherInterval);
  let lastHref = window.location.href;
  urlWatcherInterval = setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      handlePlatformChange();
    }
  }, 1000);
  window.addEventListener("popstate", handlePlatformChange);
}

function handlePlatformChange() {
  const newPlatform = detectPlatform();
  if (newPlatform === platform) return;
  console.log(`[SYNQ] platform changed: ${platform} → ${newPlatform}`);
  detachPromptInterceptor();
  platform = newPlatform;
  config = getPlatformConfig(newPlatform);
  if (!isPaused && sessionId && config) {
    attachPromptInterceptor();
    console.log(`[SYNQ] re-attached interceptor on ${newPlatform}`);
  }
}

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
  console.log(`[SYNQ] scrape: ${userEls.length} user els, ${assistantEls.length} assistant els (platform: ${platform})`);

  if (userEls.length === 0 && assistantEls.length > 0) {
    console.log("[SYNQ] user selectors returned 0 — trying structural fallback");
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
      console.log(`[SYNQ] structural fallback found ${userEls.length} user element(s)`);
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
          console.log(`[SYNQ] broad selector "${sel}" found ${userEls.length} user element(s)`);
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
  console.log(`[SYNQ] saving ${rawText.length} chars, ${lines.length} turns...`);
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
    showToast(`Saved! ${chunksStored} chunks, ${triplesExtracted} facts. SYNQ is active.`);
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
  console.log("[SYNQ] interceptor attached");
}

function detachPromptInterceptor() {
  document.removeEventListener("keydown", handlePromptKeydown, true);
  document.removeEventListener("click", handleSendButtonClick, true);
  console.log("[SYNQ] interceptor detached");
}

async function handlePromptKeydown(e: KeyboardEvent) {
  if (isPaused || isProcessingPrompt || !config) return;
  if (e.key !== "Enter" || e.shiftKey) return;
  const now = Date.now();
  if (now - lastSendTimestamp < 300) return;
  const input = queryOne(config.inputSelectors);
  if (!input || !document.activeElement?.closest(config.inputSelectors.join(","))) return;
  const promptText = input.textContent?.trim() || (input as HTMLTextAreaElement).value?.trim() || "";
  if (!promptText || promptText.length < 5) return;
  lastSendTimestamp = now;
  e.preventDefault();
  e.stopPropagation();
  await processPromptWithRAG(promptText, input as HTMLElement);
}

async function handleSendButtonClick(e: MouseEvent) {
  if (isPaused || isProcessingPrompt || !config) return;
  const target = e.target as Element;
  const isSendButton = config.sendButtonSelectors.some(sel => target.closest(sel));
  if (!isSendButton) return;
  const now = Date.now();
  if (now - lastSendTimestamp < 300) return;
  const input = queryOne(config.inputSelectors);
  if (!input) return;
  const promptText = input.textContent?.trim() || (input as HTMLTextAreaElement).value?.trim() || "";
  if (!promptText || promptText.length < 5) return;
  lastSendTimestamp = now;
  e.preventDefault();
  e.stopPropagation();
  await processPromptWithRAG(promptText, input as HTMLElement);
}

async function processPromptWithRAG(promptText: string, input: HTMLElement) {
  isProcessingPrompt = true;
  showToast("SYNQ searching memory...");
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
      console.log(`[SYNQ] session refreshed: ${sessionId} → ${currentSessionId}`);
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
      showToast(`SYNQ recalled ${count} context chunk(s)`);
    } else {
      await injectAndSend(input, promptText);
      showToast("No matching context — sending normally");
    }
  } catch (err) {
    console.error("[SYNQ] RAG error:", err);
    await injectAndSend(input, promptText);
  } finally {
    isProcessingPrompt = false;
  }
}

function buildRAGPrompt(contextBlock: string, userPrompt: string): string {
  return `[SYNQ: Relevant context from your previous session]\n${contextBlock}\n[END SYNQ CONTEXT]\n\n${userPrompt}`;
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

  if (input.isContentEditable) {
    // Select all current content so our insertText replaces it entirely
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // execCommand goes through the native editing pipeline — React/Angular/
    // custom elements all intercept this correctly, unlike synthetic events.
    const inserted = document.execCommand("insertText", false, text);

    if (!inserted) {
      // Fallback: clipboard paste simulation (works in most browsers when
      // execCommand is disabled, e.g., in some sandboxed iframes)
      try {
        await navigator.clipboard.writeText(text);
        document.execCommand("paste");
      } catch {
        // Last resort: direct assignment + native input event
        // (may not work with React but better than nothing)
        input.innerText = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  } else {
    // <textarea> or <input>: native value setter trick still works here
    // because these are not framework-managed in the same way
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (nativeSetter?.set) {
      nativeSetter.set.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Small delay to let the framework process the input event before we submit
  await new Promise(r => setTimeout(r, 250));

  const sendBtn = queryOne(config!.sendButtonSelectors) as HTMLElement | null;
  if (sendBtn) {
    sendBtn.click();
  } else {
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true, cancelable: true,
    }));
  }
}

// ── One-time inject ───────────────────────────────────────────────
async function injectContext() {
  if (!sessionId) { showToast("No session loaded. Save a chat first."); return; }
  if (!config) { showToast("Unsupported platform."); return; }
  const data = await sendMessage({ type: "GET_CONTEXT", payload: { sessionId } });
  if (!data?.contextBlock || data.tripleCount === 0) { showToast("No context found."); return; }
  const prompt = `[SYNQ CONTEXT — Previous Session Knowledge]\n${data.structuredSummary || data.contextBlock}\n[END SYNQ CONTEXT]\n---\n`;
  const input = queryOne(config.inputSelectors) as HTMLElement | null;
  if (!input) { showToast("Could not find chat input. Click the input box first."); return; }

  input.focus();

  if (input.isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand("insertText", false, prompt);
    if (!inserted) {
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
  if (document.getElementById("synq-sidebar-host")) return;
  const host = document.createElement("div");
  host.id = "synq-sidebar-host";
  document.body.appendChild(host);
  synqShadow = host.attachShadow({ mode: "open" });
  synqShadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600&display=swap');
    
    #synq-badge {
      position: fixed; bottom: 24px; right: 24px;
      background: #151822; color: #F8FAFC;
      padding: 10px 18px; border-radius: 8px;
      font-size: 12px; font-family: 'Inter', system-ui, sans-serif;
      font-weight: 600; cursor: pointer; z-index: 999999;
      border: 1px solid #1E2330;
      letter-spacing: 0.05em; transition: all 0.2s;
    }
    #synq-badge:hover { background: #1E2330; }
    #synq-badge.active {
      border-color: #6366F1;
      box-shadow: 0 0 0 1px #6366F1;
    }
    #synq-badge.paused { color: #475569; }
    #synq-toast {
      position: fixed; bottom: 76px; right: 24px;
      background: #0B0E14; color: #F8FAFC;
      padding: 10px 16px; border-radius: 6px;
      font-size: 12px; font-family: 'Inter', system-ui, sans-serif;
      z-index: 999999; opacity: 0;
      border: 1px solid #1E2330; transition: opacity 0.3s;
      pointer-events: none; max-width: 280px;
    }
  </style>
  <div id="synq-badge">SYNQ</div>
  <div id="synq-toast"></div>
  `;
}

function updateBadge(active: boolean) {
  if (!synqShadow) return;
  const badge = synqShadow.getElementById("synq-badge") as HTMLElement;
  if (!badge) return;
  badge.classList.remove("active", "paused");
  if (isPaused) {
    badge.textContent = "SYNQ OFF";
    badge.classList.add("paused");
  } else if (active) {
    badge.textContent = "SYNQ ON";
    badge.classList.add("active");
  } else {
    badge.textContent = "SYNQ";
  }
}

function showToast(message: string) {
  if (!synqShadow) return;
  const toast = synqShadow.getElementById("synq-toast") as HTMLElement;
  if (!toast) return;
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => (toast.style.opacity = "0"), 4000);
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
  if (message.type === "PAUSE_SYNQ") {
    isPaused = true;
    detachPromptInterceptor();
    updateBadge(false);
    showToast("SYNQ paused — context injection suspended");
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "RESUME_SYNQ") {
    isPaused = false;
    if (sessionId && config) {
      attachPromptInterceptor();
      updateBadge(true);
      showToast("SYNQ resumed — context injection active");
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "SESSION_CHANGED") {
    // Background broadcast: a new session was saved from another tab.
    // Update our cached sessionId immediately so the next prompt uses it.
    const { sessionId: newId, projectName } = message.payload as { sessionId: string; projectName: string };
    if (newId && newId !== sessionId) {
      console.log(`[SYNQ] session updated via broadcast: ${sessionId} → ${newId} (${projectName})`);
      sessionId = newId;
      if (config && !isPaused) {
        attachPromptInterceptor();
        updateBadge(true);
      }
      showToast(`SYNQ: session updated to "${projectName}"`);
    }
    sendResponse({ ok: true });
    return true;
  }
});

init();