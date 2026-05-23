/**
 * background.ts — v1.5.3
 */

import { ArcRiftMessage } from "./types/messages";

// v1.4.2+: Configurable backend URL and secret via storage
async function getBackendConfig() {
  const r = await chrome.storage.local.get(["ARCRIFT_backend_url"]);
  return {
    url: (String(r.ARCRIFT_backend_url || "http://localhost:3001")).replace(/\/$/, "")
  };
}

async function arcriftFetch(path: string, options: RequestInit = {}) {
  const { url } = await getBackendConfig();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  } as Record<string, string>;

  return fetch(`${url}${path}`, {
    ...options,
    headers,
  });
}

const ARCRIFT_DEBUG = (globalThis as any).__ARCRIFT_debug === true;
const log = {
  info: (...args: any[]) => ARCRIFT_DEBUG && console.log("[ArcRift bg]", ...args),
  warn: (msg: string) => console.warn(`[ArcRift bg] ${msg}`),
  error: (msg: string) => console.error(`[ArcRift bg] ${msg}`),
};

const AI_URLS = [
  "*://chatgpt.com/*",
  "*://claude.ai/*",
  "*://gemini.google.com/*",
  "*://*.deepseek.com/*",
  "*://x.com/*",
  "*://copilot.microsoft.com/*",
  "*://chat.mistral.ai/*",
  "*://m365.cloud.microsoft/*"
];

chrome.runtime.onMessage.addListener((message: ArcRiftMessage, _sender, sendResponse) => {
  log.info(`[ArcRift bg] received: ${message.type}`);

  switch (message.type) {
    case "INGEST_TEXT":
      handleIngest(message.payload).then(sendResponse);
      return true;
    case "SAVE_CHAT":
      handleSaveChat(message.payload).then(sendResponse);
      return true;
    case "GET_CONTEXT":
      handleGetContext(message.payload.sessionId).then(sendResponse);
      return true;
    case "RAG_RETRIEVE":
      handleRAGRetrieve(message.payload).then(sendResponse);
      return true;
    case "RAG_RETRIEVE_GLOBAL":
      handleRAGRetrieveGlobal(message.payload).then(sendResponse);
      return true;
    case "CREATE_SESSION":
      handleCreateSession(message.payload).then(sendResponse);
      return true;
    case "GET_SESSION":
      handleGetStoredSession().then(sendResponse);
      return true;
    case "GET_ACTIVE_SESSION":
      handleGetActiveSession().then(sendResponse);
      return true;
    case "SET_ACTIVE_SESSION":
      handleSetActiveSession(message.payload.sessionId).then(sendResponse);
      return true;
    case "GET_PAUSE_STATE":
      handleGetPauseState().then(sendResponse);
      return true;
    case "SET_PAUSE_STATE":
      handleSetPauseState(message.payload).then(sendResponse);
      return true;
    case "UNLOAD_SESSION":
      handleUnloadSession().then(sendResponse);
      return true;
    case "TOGGLE_PAUSE":
      handleTogglePause().then(sendResponse);
      return true;
    case "SESSION_CHANGED":
      // Content scripts send this to themselves — no handler needed in background
      return false;
    case "REPORT_SELECTOR_FAILURE":
      handleReportSelectorFailure(message.payload?.platform).then(sendResponse);
      return true;
    case "GET_SELECTOR_STATE":
      handleGetSelectorState().then(sendResponse);
      return true;
    case "CLEAR_SELECTOR_FAILURE":
      handleClearSelectorFailure().then(sendResponse);
      return true;
    default:
      return false;
  }
});

async function handleSaveChat(payload: {
  rawText: string;
  sessionId: string;
  platform: string;
  messageCount: number;
}) {
  try {
    const res = await arcriftFetch("/api/chat/save", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as any).error || `Server error ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    log.error(`Save chat failed: ${err}`);
    return { error: "Backend unreachable" };
  }
}

async function handleRAGRetrieve(payload: {
  prompt: string;
  sessionId: string;
  topN?: number;
}) {
  try {
    const res = await arcriftFetch("/api/rag/retrieve", {
      method: "POST",
      body: JSON.stringify({
        prompt: payload.prompt,
        sessionId: payload.sessionId,
        topN: payload.topN ?? 3,  // default 3 — sliding window chunks need more context
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      log.warn(`RAG retrieve returned ${res.status}: ${(body as any).error || ""}`);
      return { found: false, chunks: [] };
    }
    return await res.json();
  } catch (err) {
    log.error(`RAG retrieve failed: ${err}`);
    return { found: false, chunks: [] };
  }
}

async function handleIngest(payload: { text: string; sessionId: string; platform: string }) {
  try {
    const res = await arcriftFetch("/api/context/ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as any).error || `Server error ${res.status}` };
    }
    return await res.json();
  } catch {
    return { error: "Backend unreachable" };
  }
}

async function handleGetContext(sessionId: string) {
  try {
    const res = await arcriftFetch(`/api/context/retrieve/${sessionId}`);
    return await res.json();
  } catch {
    return { error: "Backend unreachable" };
  }
}

async function handleGetActiveSession() {
  try {
    const res = await arcriftFetch("/api/context/active");
    if (!res.ok) {
      log.warn(`Get active session returned ${res.status}`);
      return { activeSession: null };
    }
    const data = await res.json();
    if (data.activeSession) {
      const sessionData = {
        sessionId: data.activeSession._id,
        projectName: data.activeSession.projectName,
        tripleCount: data.activeSession.tripleCount ?? 0,
        topicCount: data.activeSession.topicCount ?? 0,
        platform: data.activeSession.platform,
      };
      await chrome.storage.local.set({ ARCRIFT_session: sessionData });
    } else {
      // Only clear if explicitly null (not an error)
      await chrome.storage.local.remove("ARCRIFT_session");
    }
    return data;
  } catch {
    return { activeSession: null };
  }
}

async function handleCreateSession(payload: { projectName: string; platform: string; sessionId?: string; externalChatId?: string }) {
  try {
    log.info(`[ArcRift bg] creating/updating session: ${payload.projectName} on ${payload.platform} (ID: ${payload.sessionId || "new"})`);
    const res = await arcriftFetch("/api/context/session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg = (body as any).error || `Server error ${res.status}`;
      log.info(`[ArcRift bg] Session setup note: ${errMsg}`); // Use info instead of error to keep extensions dashboard clean
      return { error: errMsg };
    }
    const data = await res.json();
    log.info(`[ArcRift bg] session created: ${data.sessionId}`);
    await chrome.storage.local.set({ ARCRIFT_session: data });
    // Auto-set as active so other tabs pick it up via GET_ACTIVE_SESSION
    await handleSetActiveSession(data.sessionId).catch(() => { });
    // Broadcast new session to all open AI platform tabs so they update immediately
    broadcastSessionChanged(data.sessionId, data.projectName);
    return data;
  } catch (err) {
    log.error(`Create session fetch failed: ${err}`);
    return { error: "Backend unreachable — verify URL in ArcRift settings." };
  }
}

// Notify all content scripts on AI platforms that the active session changed.
// Without this, content scripts on other tabs keep using a stale sessionId.
function broadcastSessionChanged(sessionId: string | null, projectName?: string) {
  // 1. Internal broadcast (to Popup)
  chrome.runtime.sendMessage({ type: "SESSION_CHANGED", payload: { sessionId, projectName } }).catch(() => { });

  // 2. Tab broadcast (to Content Scripts)
  chrome.tabs.query({ url: AI_URLS }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: "SESSION_CHANGED", payload: { sessionId, projectName } },
          () => { chrome.runtime.lastError; }
        );
      }
    }
  });
}

async function handleSetActiveSession(sessionId: string | null) {
  try {
    await arcriftFetch("/api/context/active", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function handleUnloadSession() {
  try {
    await chrome.storage.local.remove("ARCRIFT_session");
    await handleSetActiveSession(null);
    broadcastSessionChanged(null);
    return { success: true };
  } catch (err) {
    log.error(`Unload session failed: ${err}`);
    return { success: false, error: String(err) };
  }
}

async function handleRAGRetrieveGlobal(payload: { prompt: string; topN?: number }) {
  try {
    const res = await arcriftFetch("/api/rag/global", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { found: false };
    return res.json();
  } catch (err) {
    log.error(`Global RAG fetch failed: ${err}`);
    return { found: false };
  }
}

async function handleGetStoredSession() {
  const result = await chrome.storage.local.get("ARCRIFT_session");
  return result.ARCRIFT_session || null;
}

// ── Pause state (replaces connect state) ─────────────────────────
async function handleGetPauseState(): Promise<{ paused: boolean }> {
  const result = await chrome.storage.local.get("ARCRIFT_paused");
  return { paused: result.ARCRIFT_paused === true };
}

async function handleSetPauseState(payload: { paused: boolean }) {
  await chrome.storage.local.set({ ARCRIFT_paused: payload.paused });
  return { ok: true };
}

async function handleTogglePause() {
  const result = await chrome.storage.local.get("ARCRIFT_paused");
  const newState = result.ARCRIFT_paused !== true;
  await chrome.storage.local.set({ ARCRIFT_paused: newState });

  // Broadcast to all tabs so they update their badge and detached state
  const type = newState ? "PAUSE_ARCRIFT" : "RESUME_ARCRIFT";
  chrome.tabs.query({ url: AI_URLS }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type }, () => { chrome.runtime.lastError; });
      }
    }
  });

  return { paused: newState };
}

// ── Reliable Sync: Listen for storage changes and broadcast ──────
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "local") return;

  if (changes.ARCRIFT_session) {
    const newSession = changes.ARCRIFT_session.newValue as any;
    broadcastSessionChanged(newSession?.sessionId || null, newSession?.projectName);
  }

  if (changes.ARCRIFT_paused) {
    const isPaused = changes.ARCRIFT_paused.newValue === true;
    const type = isPaused ? "PAUSE_ARCRIFT" : "RESUME_ARCRIFT";
    chrome.tabs.query({ url: AI_URLS }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type }, () => { chrome.runtime.lastError; });
        }
      }
    });
  }
});

// ── Selector Failure State ────────────────────────────────────────
async function handleReportSelectorFailure(platform?: string) {
  await chrome.storage.local.set({
    ARCRIFT_selector_failed: true,
    ARCRIFT_selector_failed_platform: platform || "unknown",
  });
  // Notify popup if it's open
  chrome.runtime.sendMessage({
    type: "SELECTOR_FAILURE_CHANGED",
    payload: { failed: true, platform: platform || "unknown" },
  }).catch(() => {});
  return { ok: true };
}

async function handleGetSelectorState(): Promise<{ failed: boolean; platform: string }> {
  const result = await chrome.storage.local.get(["ARCRIFT_selector_failed", "ARCRIFT_selector_failed_platform"]);
  return {
    failed: result.ARCRIFT_selector_failed === true,
    platform: (result.ARCRIFT_selector_failed_platform as string) || "unknown",
  };
}

async function handleClearSelectorFailure() {
  await chrome.storage.local.remove(["ARCRIFT_selector_failed", "ARCRIFT_selector_failed_platform"]);
  chrome.runtime.sendMessage({
    type: "SELECTOR_FAILURE_CHANGED",
    payload: { failed: false, platform: "unknown" },
  }).catch(() => {});
  return { ok: true };
}
