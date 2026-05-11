/**
 * background.ts — v1.4.6
 */

import { GliaMessage } from "./types/messages";

// v1.4.2+: Configurable backend URL and secret via storage
async function getBackendConfig() {
  const r = await chrome.storage.local.get(["glia_backend_url", "glia_secret"]);
  return {
    url: (String(r.glia_backend_url || "http://localhost:3001")).replace(/\/$/, ""),
    secret: String(r.glia_secret || "")
  };
}

/**
 * gliaFetch — wrapper around fetch that injects the configurable backend URL
 * and the X-GLIA-Secret auth header if present.
 */
async function gliaFetch(path: string, options: RequestInit = {}) {
  const { url, secret } = await getBackendConfig();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  } as Record<string, string>;

  if (secret) {
    headers["X-GLIA-Secret"] = secret;
  }

  return fetch(`${url}${path}`, {
    ...options,
    headers,
  });
}

const GLIA_DEBUG = (globalThis as any).__glia_debug === true;
const log = {
  info: (...args: any[]) => GLIA_DEBUG && console.log("[GLIA bg]", ...args),
  warn: (msg: string) => console.warn(`[GLIA bg] ${msg}`),
  error: (msg: string) => console.error(`[GLIA bg] ${msg}`),
};

chrome.runtime.onMessage.addListener((message: GliaMessage, _sender, sendResponse) => {
  log.info(`[GLIA bg] received: ${message.type}`);

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
    const res = await gliaFetch("/api/chat/save", {
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
    const res = await gliaFetch("/api/rag/retrieve", {
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
    const res = await gliaFetch("/api/context/ingest", {
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
    const res = await gliaFetch(`/api/context/retrieve/${sessionId}`);
    return await res.json();
  } catch {
    return { error: "Backend unreachable" };
  }
}

async function handleGetActiveSession() {
  try {
    const res = await gliaFetch("/api/context/active");
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
      await chrome.storage.local.set({ glia_session: sessionData });
    } else {
      // Only clear if explicitly null (not an error)
      await chrome.storage.local.remove("glia_session");
    }
    return data;
  } catch {
    return { activeSession: null };
  }
}

async function handleCreateSession(payload: { projectName: string; platform: string; sessionId?: string }) {
  try {
    log.info(`[GLIA bg] creating/updating session: ${payload.projectName} on ${payload.platform} (ID: ${payload.sessionId || "new"})`);
    const res = await gliaFetch("/api/context/session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg = (body as any).error || `Server error ${res.status}`;
      log.error(`Create session failed: ${errMsg}`);
      return { error: errMsg };
    }
    const data = await res.json();
    log.info(`[GLIA bg] session created: ${data.sessionId}`);
    await chrome.storage.local.set({ glia_session: data });
    // Auto-set as active so other tabs pick it up via GET_ACTIVE_SESSION
    await handleSetActiveSession(data.sessionId).catch(() => { });
    // Broadcast new session to all open AI platform tabs so they update immediately
    broadcastSessionChanged(data.sessionId, data.projectName);
    return data;
  } catch (err) {
    log.error(`Create session fetch failed: ${err}`);
    return { error: "Backend unreachable — verify URL in Glia settings." };
  }
}

// Notify all content scripts on AI platforms that the active session changed.
// Without this, content scripts on other tabs keep using a stale sessionId.
function broadcastSessionChanged(sessionId: string | null, projectName?: string) {
  const AI_URLS = [
    "*://chatgpt.com/*",
    "*://claude.ai/*",
    "*://gemini.google.com/*",
    "*://*.deepseek.com/*",
  ];
  chrome.tabs.query({ url: AI_URLS }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: "SESSION_CHANGED", payload: { sessionId, projectName } },
          () => { chrome.runtime.lastError; } // suppress "no receiver" errors
        );
      }
    }
  });
}

async function handleSetActiveSession(sessionId: string | null) {
  try {
    await gliaFetch("/api/context/active", {
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
    await chrome.storage.local.remove("glia_session");
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
    const res = await gliaFetch("/api/rag/global", {
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
  const result = await chrome.storage.local.get("glia_session");
  return result.glia_session || null;
}

// ── Pause state (replaces connect state) ─────────────────────────
async function handleGetPauseState(): Promise<{ paused: boolean }> {
  const result = await chrome.storage.local.get("glia_paused");
  return { paused: result.glia_paused === true };
}

async function handleSetPauseState(payload: { paused: boolean }) {
  await chrome.storage.local.set({ glia_paused: payload.paused });
  return { ok: true };
}

async function handleTogglePause() {
  const result = await chrome.storage.local.get("glia_paused");
  const newState = result.glia_paused !== true;
  await chrome.storage.local.set({ glia_paused: newState });

  // Broadcast to all tabs so they update their badge and detached state
  const type = newState ? "PAUSE_GLIA" : "RESUME_GLIA";
  const AI_URLS = ["*://chatgpt.com/*", "*://claude.ai/*", "*://gemini.google.com/*", "*://*.deepseek.com/*"];
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

  if (changes.glia_session) {
    const newSession = changes.glia_session.newValue as any;
    broadcastSessionChanged(newSession?.sessionId || null, newSession?.projectName);
  }

  if (changes.glia_paused) {
    const isPaused = changes.glia_paused.newValue === true;
    const type = isPaused ? "PAUSE_GLIA" : "RESUME_GLIA";
    const AI_URLS = ["*://chatgpt.com/*", "*://claude.ai/*", "*://gemini.google.com/*", "*://*.deepseek.com/*"];
    chrome.tabs.query({ url: AI_URLS }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type }, () => { chrome.runtime.lastError; });
        }
      }
    });
  }
});
