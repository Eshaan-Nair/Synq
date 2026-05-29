// popup.ts — v1.5.4
// Replaced Connect/Disconnect with a Pause toggle
// Auto-connect happens in content.ts on init — popup only shows state + pause control

type Platform = "claude" | "chatgpt" | "gemini" | "deepseek" | "unknown";

interface SessionData {
  sessionId: string;
  projectName: string;
  tripleCount?: number;
  topicCount?: number;
}

const statusEl = document.getElementById("status") as HTMLElement;
const sessionInfo = document.getElementById("session-info") as HTMLElement;
const sessionNameEl = document.getElementById("session-name") as HTMLElement;
const tripleCountEl = document.getElementById("triple-count") as HTMLElement;
const topicCountEl = document.getElementById("topic-count") as HTMLElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const pauseToggleBtn = document.getElementById("pause-toggle-btn") as HTMLButtonElement;
const unloadBtn = document.getElementById("unload-btn") as HTMLButtonElement;
const injectBtn = document.getElementById("inject-btn") as HTMLButtonElement;
const detectedPlatformEl = document.getElementById("detected-platform") as HTMLElement;
const platformDot = document.getElementById("platform-dot") as HTMLElement;
const arcriftStatusBadge = document.getElementById("ArcRift-status-badge") as HTMLElement;
const projectNameInput = document.getElementById("project-name") as HTMLInputElement;
const selectorWarningEl = document.getElementById("selector-warning") as HTMLElement;
const selectorWarningMsgEl = document.getElementById("selector-warning-msg") as HTMLElement;
const selectorDismissBtn = document.getElementById("selector-dismiss-btn") as HTMLButtonElement;

const PLATFORM_LABELS: Record<Platform, string> = {
  claude: "Claude (claude.ai)",
  chatgpt: "ChatGPT (chatgpt.com)",
  gemini: "Gemini (gemini.google.com)",
  deepseek: "DeepSeek (chat.deepseek.com)",
  unknown: "Not on a supported platform",
};

let currentSessionId: string | null = null;
let isPaused = false;

const PLATFORM_HOSTNAMES: Record<string, string> = {
  claude: "claude.ai",
  chatgpt: "chatgpt.com",
  gemini: "gemini.google.com",
  deepseek: "deepseek.com",
};

async function detectPlatformFromTab(): Promise<Platform> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  for (const [name, host] of Object.entries(PLATFORM_HOSTNAMES)) {
    if (url.includes(host)) return name as Platform;
  }

  return "unknown";
}

async function getTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/**
 * Extracts a stable "Chat ID" from platform URLs to handle URL changes
 * (e.g. chatgpt.com/ -> chatgpt.com/c/uuid)
 */
function getSmartUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");

    // ChatGPT: chatgpt.com/c/UUID
    if (host === "chatgpt.com" && u.pathname.startsWith("/c/")) {
      return host + u.pathname.split("/").slice(0, 3).join("/");
    }
    // Claude: claude.ai/chat/UUID
    if (host === "claude.ai" && u.pathname.startsWith("/chat/")) {
      return host + u.pathname.split("/").slice(0, 3).join("/");
    }
    // Gemini: gemini.google.com/app/ID
    if (host === "gemini.google.com" && u.pathname.startsWith("/app/")) {
      return host + u.pathname.split("/").slice(0, 3).join("/");
    }
    // DeepSeek: chat.deepseek.com/a/chat/s/ID
    if (host === "chat.deepseek.com" && u.pathname.startsWith("/a/chat/s/")) {
      return host + u.pathname.split("/").slice(0, 5).join("/");
    }

    // Fallback: strip query params and hashes for a cleaner key
    return host + u.pathname.replace(/\/$/, "");
  } catch (e) {
    return url;
  }
}

async function isContentScriptReady(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "PING" }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  // v1.4.6: Prevent injection on restricted URLs (chrome://, about:, etc.)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (!url || url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://") || url.startsWith("edge://")) {
    return false;
  }

  if (await isContentScriptReady(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["dist/content.js"] });
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (err) {
    // If it's a restricted page we missed, don't log it as a scary error
    const msg = String(err);
    if (msg.includes("Cannot access") || msg.includes("restricted")) {
      return false;
    }
    console.error("[ArcRift popup] Could not inject content script:", err);
    return false;
  }
}

// ── Boot ─────────────────────────────────────────────────────────
(async () => {
  const platform = await detectPlatformFromTab();

  if (platform === "unknown") {
    detectedPlatformEl.textContent = PLATFORM_LABELS.unknown;
    platformDot.classList.add("unknown");
    saveBtn.disabled = true;
  } else {
    detectedPlatformEl.textContent = PLATFORM_LABELS[platform];
  }

  // Load both session and pause state, then update UI once both resolve
  const sessionPromise = new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_SESSION" }, async (response) => {
      // Get current tab URL for smartKey mapping
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabUrl = activeTab?.url || "";
      const smartKey = getSmartUrlKey(tabUrl);

      if (response?.activeSession) {
        currentSessionId = response.activeSession._id as string;


        showSession({
          sessionId: response.activeSession._id as string,
          projectName: response.activeSession.projectName as string,
          tripleCount: response.activeSession.tripleCount as number,
          topicCount: response.activeSession.topicCount as number,
        });
        resolve();
      } else {
        // SMART BOOT: Check if this specific URL is already mapped to a session
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabUrl = tab?.url || "";
        const smartKey = getSmartUrlKey(tabUrl);

        chrome.storage.local.get(["ARCRIFT_session", "ARCRIFT_url_map"], (result) => {
          const urlMap = (result.ARCRIFT_url_map || {}) as Record<string, string>;
          const mappedId = urlMap[smartKey];

          if (mappedId) {
            const lastSession = result.ARCRIFT_session as SessionData;
            if (lastSession && lastSession.sessionId === mappedId) {
              showSession(lastSession);
            }
          } else if (result.ARCRIFT_session) {
            // Show last active session info at bottom
            showSession(result.ARCRIFT_session as SessionData);
          }
          resolve();
        });
      }
    });
  });

  const pausePromise = new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PAUSE_STATE" }, (response) => {
      isPaused = response?.paused === true;
      resolve();
    });
  });

  // Wait for all, then update the UI
  await Promise.all([sessionPromise, pausePromise]);
  pauseToggleBtn.disabled = false; // Always allow pausing/resuming
  updatePauseUI();

  // Check for a pending selector failure from the last session
  chrome.runtime.sendMessage({ type: "GET_SELECTOR_STATE" }, (response) => {
    if (response?.failed) {
      showSelectorWarning(response.platform);
    }
  });
})();

// ── Save Chat ─────────────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  const projectName = projectNameInput.value.trim();
  if (!projectName) { setStatus("⚠ Enter a session name first", "error"); return; }

  const tabId = await getTabId();
  if (!tabId) { setStatus("⚠ No active tab", "error"); return; }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") { setStatus("⚠ Open Claude, ChatGPT, Gemini, or DeepSeek first", "error"); return; }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  setStatus("Checking content script...");

  const ready = await ensureContentScript(tabId);
  if (!ready) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Chat";
    setStatus("⚠ Could not load content script. Try refreshing the page.", "error");
    return;
  }

  // Step 1: Create or update session from popup → background
  setStatus("Creating session...");

  // Check if we already have a session for this specific URL or currently loaded
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = activeTab?.url || "";
  const smartKey = getSmartUrlKey(tabUrl);
  let existingSessionId: string | undefined;

  if (tabUrl) {
    const result = await chrome.storage.local.get("ARCRIFT_url_map");
    const urlMap = (result.ARCRIFT_url_map || {}) as Record<string, string>;
    existingSessionId = urlMap[smartKey] || urlMap[tabUrl];
  }

  // FIX: Prioritise currentSessionId if it exists to prevent duplicates
  // BUT: Verify it belongs to this smartKey to prevent session hijacking across tabs
  let sessionIdToUse = currentSessionId || existingSessionId;
  if (sessionIdToUse && sessionIdToUse !== existingSessionId && existingSessionId) {
    console.warn("[ArcRift popup] Session ID mismatch for this URL. Resetting to URL-mapped ID.");
    sessionIdToUse = existingSessionId;
  } else if (sessionIdToUse && !existingSessionId && currentSessionId) {
    // We are on a new URL but the popup has an old session in memory
    console.info("[ArcRift popup] New URL detected. Clearing stale session ID.");
    sessionIdToUse = undefined;
  }

  if (sessionIdToUse) {
    console.log(`[ArcRift popup] using session: ${sessionIdToUse} (current: ${!!currentSessionId}, url-mapped: ${!!existingSessionId})`);
  }

  const sessionResult = await new Promise<any>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "CREATE_SESSION",
        payload: {
          projectName,
          platform,
          sessionId: sessionIdToUse,
          externalChatId: smartKey
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      }
    );
  });

  if (!sessionResult?.sessionId) {
    // If we tried to update an existing session but it was deleted on the backend
    if (sessionResult?.error === "Session not found" && sessionIdToUse) {
      console.warn(`[ArcRift popup] session ${sessionIdToUse} not found on backend. Clearing mapping and retrying...`);

      // Clear mapping and state
      if (tabUrl) {
        const urlMapResult = await chrome.storage.local.get("ARCRIFT_url_map");
        const urlMap = (urlMapResult.ARCRIFT_url_map || {}) as Record<string, string>;
        delete urlMap[smartKey];
        delete urlMap[tabUrl];
        await chrome.storage.local.set({ ARCRIFT_url_map: urlMap });
      }
      currentSessionId = null;

      // Retry creation
      setStatus("Session stale, creating new one...");
      const retryResult = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "CREATE_SESSION", payload: { projectName, platform } },
          (response) => resolve(response)
        );
      });

      if (!retryResult?.sessionId) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Chat";
        setStatus(`⚠ ${retryResult?.error || "Failed to create session"}`, "error");
        return;
      }

      sessionResult.sessionId = retryResult.sessionId;
    } else {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Chat";
      setStatus(`⚠ ${sessionResult?.error || "Failed to create session. Is the backend running?"}`, "error");

      // Trigger shake animation on input
      projectNameInput.classList.add("shake");
      setTimeout(() => projectNameInput.classList.remove("shake"), 500);
      return;
    }
  }

  // Step 2: Tell content script to scrape + save using the sessionId we just created
  setStatus("Scraping chat...");
  chrome.tabs.sendMessage(
    tabId,
    { type: "SAVE_CHAT_FROM_POPUP", payload: { projectName, platform, sessionId: sessionResult.sessionId } },
    (response) => {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Chat";

      if (chrome.runtime.lastError || !response) {
        setStatus("⚠ Lost connection to content script. Refresh and try again.", "error");
        return;
      }
      if (response.error) { setStatus(`⚠ ${response.error as string}`, "error"); return; }

      if (response.success) {
        currentSessionId = sessionResult.sessionId as string;
        const sessionData: SessionData = {
          sessionId: sessionResult.sessionId as string,
          projectName,
          tripleCount: response.triplesExtracted as number,
          topicCount: response.topicsExtracted as number,
        };
        chrome.storage.local.set({ ARCRIFT_session: sessionData });

        // Save the URL -> sessionId mapping so we update instead of create next time
        if (tabUrl) {
          chrome.storage.local.get("ARCRIFT_url_map", (result) => {
            const urlMap = (result.ARCRIFT_url_map || {}) as Record<string, string>;
            urlMap[smartKey] = sessionResult.sessionId;
            // Also map the original URL just in case
            urlMap[tabUrl] = sessionResult.sessionId;
            chrome.storage.local.set({ ARCRIFT_url_map: urlMap });
          });
        }

        showSession(sessionData);
        const chunks = response.topicsExtracted as number;
        const facts = response.triplesExtracted as number;
        setStatus(`Saved! ArcRift auto-connected.`);

        // ── Success State Glow ───────────────────────────────────────
        document.body.classList.add("success-glow");
        setTimeout(() => document.body.classList.remove("success-glow"), 2500);
      }
    }
  );
});

// ── Pause / Resume ────────────────────────────────────────────────
pauseToggleBtn.addEventListener("click", async () => {
  const tabId = await getTabId();
  if (!tabId) return;

  isPaused = !isPaused;
  updatePauseUI();

  // Persist pause state
  chrome.runtime.sendMessage({ type: "SET_PAUSE_STATE", payload: { paused: isPaused } });

  // Tell the content script
  const ready = await ensureContentScript(tabId);
  if (ready) {
    chrome.tabs.sendMessage(tabId, { type: isPaused ? "PAUSE_ARCRIFT" : "RESUME_ARCRIFT" }, () => { });
  }

  setStatus(isPaused ? "⏸ ArcRift paused" : "▶ ArcRift resumed");
});

// ── Unload Session ───────────────────────────────────────────────
unloadBtn.addEventListener("click", async () => {
  if (!currentSessionId) return;

  unloadBtn.disabled = true;
  unloadBtn.textContent = "Unloading...";

  chrome.runtime.sendMessage({ type: "UNLOAD_SESSION" }, (response) => {
    unloadBtn.disabled = false;
    unloadBtn.textContent = "Unload Session";

    if (response?.success) {
      currentSessionId = null;
      chrome.storage.local.remove("ARCRIFT_session");
      sessionInfo.style.display = "none";
      projectNameInput.value = ""; // Clear input on unload
      updatePauseUI();
      setStatus("Session unloaded");
    } else {
      setStatus("⚠ Failed to unload session", "error");
    }
  });
});

// Listen for broadcasted session changes (e.g. from Dashboard)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SESSION_CHANGED") {
    const { sessionId, projectName } = message.payload;
    if (sessionId) {
      currentSessionId = sessionId;
      if (projectName) {
        showSession({ sessionId, projectName });
      }
    } else {
      currentSessionId = null;
      sessionInfo.style.display = "none";
      projectNameInput.value = "";
    }
    updatePauseUI();
  }

  if (message.type === "SELECTOR_FAILURE_CHANGED") {
    if (message.payload?.failed) {
      showSelectorWarning(message.payload.platform);
    } else {
      hideSelectorWarning();
    }
  }
});

// ── Inject Context (one-time) ─────────────────────────────────────
injectBtn.addEventListener("click", async () => {
  const tabId = await getTabId();
  if (!tabId) { setStatus("⚠ No active tab", "error"); return; }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") { setStatus("⚠ Open Claude, ChatGPT, Gemini, or DeepSeek first", "error"); return; }

  const ready = await ensureContentScript(tabId);
  if (!ready) { setStatus("⚠ Could not reach page. Refresh and try again.", "error"); return; }

  setStatus("Injecting context...");
  chrome.tabs.sendMessage(tabId, { type: "INJECT_NOW" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setStatus("⚠ Injection failed. Click the chat input first, then retry.", "error");
    }
  });
});

// ── UI helpers ────────────────────────────────────────────────────
function showSession(data: SessionData) {
  sessionInfo.style.display = "block";
  sessionNameEl.textContent = data.projectName || "—";
  tripleCountEl.textContent = String(data.tripleCount ?? "—");
  topicCountEl.textContent = String(data.topicCount ?? "—");

  if (data.sessionId) {
    currentSessionId = data.sessionId;
    projectNameInput.value = ""; // Clear input to keep UI clean
    unloadBtn.disabled = false;
  }
}

function updatePauseUI() {
  if (isPaused) {
    pauseToggleBtn.textContent = "▶ Resume ArcRift";
    pauseToggleBtn.classList.add("paused");
    arcriftStatusBadge.textContent = "⏸ Paused";
    arcriftStatusBadge.className = "ArcRift-status paused";
  } else {
    pauseToggleBtn.textContent = "⏸ Pause ArcRift";
    pauseToggleBtn.classList.remove("paused");
    arcriftStatusBadge.textContent = currentSessionId ? "🟢 Active" : "⚪ No session";
    arcriftStatusBadge.className = `ArcRift-status ${currentSessionId ? "active" : "idle"}`;
  }
}

function setStatus(msg: string, type: "ok" | "error" | "warn" = "ok") {
  statusEl.textContent = msg;
  statusEl.className = type;
  if (type === "ok") setTimeout(() => (statusEl.textContent = ""), 6000);
}

// ── Selector Warning Banner ────────────────────────────────────────
function showSelectorWarning(platform: string) {
  selectorWarningMsgEl.textContent =
    `Could not connect to ${capitalize(platform)}. Selector may be stale.`;
  selectorWarningEl.style.display = "block";
  // Also update the ArcRift status badge to warning
  arcriftStatusBadge.textContent = "⚠ Injection Failed";
  arcriftStatusBadge.className = "ArcRift-status warning";
}

function hideSelectorWarning() {
  selectorWarningEl.style.display = "none";
  updatePauseUI(); // Restore normal badge
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Dismiss button ─────────────────────────────────────────────────
selectorDismissBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_SELECTOR_FAILURE" });
  hideSelectorWarning();
});
