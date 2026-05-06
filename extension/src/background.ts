/**
 * background.ts — v1.2
 */

import { SynqMessage } from "./types/messages";

// v1.4.1+: Configurable backend URL and secret via storage
async function getBackendConfig() {
  const r = await chrome.storage.local.get(["synq_backend_url", "synq_secret"]);
  return {
    url: (String(r.synq_backend_url || "http://localhost:3001")).replace(/\/$/, ""),
    secret: String(r.synq_secret || "")
  };
}

/**
 * synqFetch — wrapper around fetch that injects the configurable backend URL
 * and the X-SYNQ-Secret auth header if present.
 */
async function synqFetch(path: string, options: RequestInit = {}) {
  const { url, secret } = await getBackendConfig();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  } as Record<string, string>;

  if (secret) {
    headers["X-SYNQ-Secret"] = secret;
  }

  return fetch(`${url}${path}`, {
    ...options,
    headers,
  });
}

const log = {
  warn:  (msg: string) => console.warn(`[SYNQ bg] ${msg}`),
  error: (msg: string) => console.error(`[SYNQ bg] ${msg}`),
};

chrome.runtime.onMessage.addListener((message: SynqMessage, _sender, sendResponse) => {
  console.log(`[SYNQ bg] received: ${message.type}`);
  
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
    const res = await synqFetch("/api/chat/save", {
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
    const res = await synqFetch("/api/rag/retrieve", {
      method: "POST",
      body: JSON.stringify({
        prompt:    payload.prompt,
        sessionId: payload.sessionId,
        topN:      payload.topN ?? 3,  // default 3 — sliding window chunks need more context
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
    const res = await synqFetch("/api/context/ingest", {
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
    const res = await synqFetch(`/api/context/retrieve/${sessionId}`);
    return await res.json();
  } catch {
    return { error: "Backend unreachable" };
  }
}

async function handleGetActiveSession() {
  try {
    const res = await synqFetch("/api/context/active");
    if (!res.ok) {
      log.warn(`Get active session returned ${res.status}`);
      return { activeSession: null };
    }
    const data = await res.json();
    if (data.activeSession) {
      const sessionData = {
        sessionId:   data.activeSession._id,
        projectName: data.activeSession.projectName,
        tripleCount: data.activeSession.tripleCount ?? 0,
        topicCount:  data.activeSession.topicCount  ?? 0,
        platform:    data.activeSession.platform,
      };
      await chrome.storage.local.set({ synq_session: sessionData });
    } else {
      // Only clear if explicitly null (not an error)
      await chrome.storage.local.remove("synq_session");
    }
    return data;
  } catch {
    return { activeSession: null };
  }
}

async function handleCreateSession(payload: { projectName: string; platform: string; sessionId?: string }) {
  try {
    console.log(`[SYNQ bg] creating/updating session: ${payload.projectName} on ${payload.platform} (ID: ${payload.sessionId || "new"})`);
    const res = await synqFetch("/api/context/session", {
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
    console.log(`[SYNQ bg] session created: ${data.sessionId}`);
    await chrome.storage.local.set({ synq_session: data });
    // Auto-set as active so other tabs pick it up via GET_ACTIVE_SESSION
    await handleSetActiveSession(data.sessionId).catch(() => {});
    // Broadcast new session to all open AI platform tabs so they update immediately
    broadcastSessionChanged(data.sessionId, data.projectName);
    return data;
  } catch (err) {
    log.error(`Create session fetch failed: ${err}`);
    return { error: "Backend unreachable — verify URL in Synq settings." };
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
    await synqFetch("/api/context/active", {
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
    await chrome.storage.local.remove("synq_session");
    await handleSetActiveSession(null);
    broadcastSessionChanged(null);
    return { success: true };
  } catch (err) {
    log.error(`Unload session failed: ${err}`);
    return { success: false, error: String(err) };
  }
}

async function handleGetStoredSession() {
  const result = await chrome.storage.local.get("synq_session");
  return result.synq_session || null;
}

// ── Pause state (replaces connect state) ─────────────────────────
async function handleGetPauseState(): Promise<{ paused: boolean }> {
  const result = await chrome.storage.local.get("synq_paused");
  return { paused: result.synq_paused === true };
}

async function handleSetPauseState(payload: { paused: boolean }) {
  await chrome.storage.local.set({ synq_paused: payload.paused });
  return { ok: true };
}

async function handleTogglePause() {
  const result = await chrome.storage.local.get("synq_paused");
  const newState = result.synq_paused !== true;
  await chrome.storage.local.set({ synq_paused: newState });
  
  // Broadcast to all tabs so they update their badge and detached state
  const type = newState ? "PAUSE_SYNQ" : "RESUME_SYNQ";
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

  if (changes.synq_session) {
    const newSession = changes.synq_session.newValue as any;
    broadcastSessionChanged(newSession?.sessionId || null, newSession?.projectName);
  }

  if (changes.synq_paused) {
    const isPaused = changes.synq_paused.newValue === true;
    const type = isPaused ? "PAUSE_SYNQ" : "RESUME_SYNQ";
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