/**
 * background.ts — v1.2
 *
 * Changes from v1.1:
 * - Removed GET_CONNECT_STATE / SET_CONNECT_STATE (connect button removed)
 * - Added GET_PAUSE_STATE / SET_PAUSE_STATE (pause toggle)
 * - RAG retrieve topN default raised to 3 (sliding window chunks are smaller)
 */

const BACKEND = "http://localhost:3001";

const log = {
  warn:  (msg: string) => console.warn(`[SYNQ bg] ${msg}`),
  error: (msg: string) => console.error(`[SYNQ bg] ${msg}`),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log(`[SYNQ bg] received: ${message.type}`);
  if (message.type === "INGEST_TEXT") {
    handleIngest(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "SAVE_CHAT") {
    handleSaveChat(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "GET_CONTEXT") {
    handleGetContext(message.payload.sessionId).then(sendResponse);
    return true;
  }
  if (message.type === "RAG_RETRIEVE") {
    handleRAGRetrieve(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "CREATE_SESSION") {
    handleCreateSession(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "GET_SESSION") {
    handleGetStoredSession().then(sendResponse);
    return true;
  }
  if (message.type === "GET_ACTIVE_SESSION") {
    handleGetActiveSession().then(sendResponse);
    return true;
  }
  if (message.type === "SET_ACTIVE_SESSION") {
    handleSetActiveSession(message.payload.sessionId).then(sendResponse);
    return true;
  }
  if (message.type === "SESSION_CHANGED") {
    // Content scripts send this to themselves — no handler needed in background
    return false;
  }
  if (message.type === "GET_PAUSE_STATE") {
    handleGetPauseState().then(sendResponse);
    return true;
  }
  if (message.type === "SET_PAUSE_STATE") {
    handleSetPauseState(message.payload).then(sendResponse);
    return true;
  }
});

async function handleSaveChat(payload: {
  rawText: string;
  sessionId: string;
  platform: string;
  messageCount: number;
}) {
  try {
    const res = await fetch(`${BACKEND}/api/chat/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${BACKEND}/api/rag/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${BACKEND}/api/context/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${BACKEND}/api/context/retrieve/${sessionId}`);
    return await res.json();
  } catch {
    return { error: "Backend unreachable" };
  }
}

async function handleGetActiveSession() {
  try {
    const res = await fetch(`${BACKEND}/api/context/active`);
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
      // Active session was deleted or never set — clear stale local data
      await chrome.storage.local.remove("synq_session");
    }
    return data;
  } catch {
    return { activeSession: null };
  }
}

async function handleCreateSession(payload: { projectName: string; platform: string }) {
  try {
    console.log(`[SYNQ bg] creating session: ${payload.projectName} on ${payload.platform}`);
    const res = await fetch(`${BACKEND}/api/context/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    return { error: "Backend unreachable — is it running on port 3001?" };
  }
}

// Notify all content scripts on AI platforms that the active session changed.
// Without this, content scripts on other tabs keep using a stale sessionId.
function broadcastSessionChanged(sessionId: string, projectName: string) {
  const AI_URLS = [
    "*://chatgpt.com/*",
    "*://claude.ai/*",
    "*://gemini.google.com/*",
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

async function handleSetActiveSession(sessionId: string) {
  try {
    await fetch(`${BACKEND}/api/context/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
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