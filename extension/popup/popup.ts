// popup.ts — v1.4.6
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
const gliaStatusBadge = document.getElementById("glia-status-badge") as HTMLElement;
const projectNameInput = document.getElementById("project-name") as HTMLInputElement;

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
    console.error("[GLIA popup] Could not inject content script:", err);
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
      if (response?.activeSession) {
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

        chrome.storage.local.get(["glia_session", "glia_url_map"], (result) => {
          const urlMap = (result.glia_url_map || {}) as Record<string, string>;
          const mappedId = urlMap[smartKey];

          if (mappedId) {
            // If this tab is mapped to a session, we should probably fetch it
            // For now, let's just see if our "last known" session matches the ID
            const lastSession = result.glia_session as SessionData;
            if (lastSession && lastSession.sessionId === mappedId) {
              showSession(lastSession);
            } else {
              // Future improvement: fetch the specific session by ID from backend
            }
          } else if (result.glia_session) {
            showSession(result.glia_session as SessionData);
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
})();

// ── Save Chat ─────────────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  const projectName = projectNameInput.value.trim();
  if (!projectName) { setStatus("⚠ Enter a session name first", "error"); return; }

  const tabId = await getTabId();
  if (!tabId) { setStatus("❌ No active tab", "error"); return; }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") { setStatus("❌ Open Claude, ChatGPT, Gemini, or DeepSeek first", "error"); return; }

  saveBtn.disabled = true;
  saveBtn.textContent = "⏳ Saving...";
  setStatus("Checking content script...");

  const ready = await ensureContentScript(tabId);
  if (!ready) {
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 Save Chat";
    setStatus("❌ Could not load content script. Try refreshing the page.", "error");
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
    const result = await chrome.storage.local.get("glia_url_map");
    const urlMap = (result.glia_url_map || {}) as Record<string, string>;
    existingSessionId = urlMap[smartKey] || urlMap[tabUrl];
  }

  // FIX: Prioritise currentSessionId if it exists to prevent duplicates
  // BUT: Verify it belongs to this smartKey to prevent session hijacking across tabs
  let sessionIdToUse = currentSessionId || existingSessionId;
  if (sessionIdToUse && sessionIdToUse !== existingSessionId && existingSessionId) {
    console.warn("[GLIA popup] Session ID mismatch for this URL. Resetting to URL-mapped ID.");
    sessionIdToUse = existingSessionId;
  } else if (sessionIdToUse && !existingSessionId && currentSessionId) {
    // We are on a new URL but the popup has an old session in memory
    console.info("[GLIA popup] New URL detected. Clearing stale session ID.");
    sessionIdToUse = undefined;
  }

  if (sessionIdToUse) {
    console.log(`[GLIA popup] using session: ${sessionIdToUse} (current: ${!!currentSessionId}, url-mapped: ${!!existingSessionId})`);
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
      console.warn(`[GLIA popup] session ${sessionIdToUse} not found on backend. Clearing mapping and retrying...`);

      // Clear mapping and state
      if (tabUrl) {
        const urlMapResult = await chrome.storage.local.get("glia_url_map");
        const urlMap = (urlMapResult.glia_url_map || {}) as Record<string, string>;
        delete urlMap[smartKey];
        delete urlMap[tabUrl];
        await chrome.storage.local.set({ glia_url_map: urlMap });
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
        saveBtn.textContent = "💾 Save Chat";
        setStatus(`❌ ${retryResult?.error || "Failed to create session"}`, "error");
        return;
      }

      sessionResult.sessionId = retryResult.sessionId;
    } else {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Save Chat";
      setStatus(`❌ ${sessionResult?.error || "Failed to create session. Is the backend running?"}`, "error");
      
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
      saveBtn.textContent = "💾 Save Chat";

      if (chrome.runtime.lastError || !response) {
        setStatus("❌ Lost connection to content script. Refresh and try again.", "error");
        return;
      }
      if (response.error) { setStatus(`❌ ${response.error as string}`, "error"); return; }

      if (response.success) {
        currentSessionId = sessionResult.sessionId as string;
        const sessionData: SessionData = {
          sessionId: sessionResult.sessionId as string,
          projectName,
          tripleCount: response.triplesExtracted as number,
          topicCount: response.topicsExtracted as number,
        };
        chrome.storage.local.set({ glia_session: sessionData });

        // Save the URL -> sessionId mapping so we update instead of create next time
        if (tabUrl) {
          chrome.storage.local.get("glia_url_map", (result) => {
            const urlMap = (result.glia_url_map || {}) as Record<string, string>;
            urlMap[smartKey] = sessionResult.sessionId;
            // Also map the original URL just in case
            urlMap[tabUrl] = sessionResult.sessionId;
            chrome.storage.local.set({ glia_url_map: urlMap });
          });
        }

        showSession(sessionData);
        const chunks = response.topicsExtracted as number;
        const facts = response.triplesExtracted as number;
        setStatus(`✅ Saved! ${chunks} chunks stored, ${facts} facts extracted. GLIA auto-connected.`);

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
    chrome.tabs.sendMessage(tabId, { type: isPaused ? "PAUSE_GLIA" : "RESUME_GLIA" }, () => { });
  }

  setStatus(isPaused ? "⏸ GLIA paused" : "▶️ GLIA resumed");
});

// ── Unload Session ───────────────────────────────────────────────
unloadBtn.addEventListener("click", async () => {
  if (!currentSessionId) return;

  unloadBtn.disabled = true;
  unloadBtn.textContent = "⏳ Unloading...";

  chrome.runtime.sendMessage({ type: "UNLOAD_SESSION" }, (response) => {
    unloadBtn.disabled = false;
    unloadBtn.textContent = "Unload Session";

    if (response?.success) {
      currentSessionId = null;
      chrome.storage.local.remove("glia_session");
      sessionInfo.style.display = "none";
      updatePauseUI();
      setStatus("🔌 Session unloaded");
    } else {
      setStatus("❌ Failed to unload session", "error");
    }
  });
});

// ── Inject Context (one-time) ─────────────────────────────────────
injectBtn.addEventListener("click", async () => {
  const tabId = await getTabId();
  if (!tabId) { setStatus("❌ No active tab", "error"); return; }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") { setStatus("❌ Open Claude, ChatGPT, Gemini, or DeepSeek first", "error"); return; }

  const ready = await ensureContentScript(tabId);
  if (!ready) { setStatus("❌ Could not reach page. Refresh and try again.", "error"); return; }

  setStatus("Injecting context...");
  chrome.tabs.sendMessage(tabId, { type: "INJECT_NOW" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setStatus("❌ Injection failed. Click the chat input first, then retry.", "error");
    }
  });
});

// ── UI helpers ────────────────────────────────────────────────────
function showSession(data: SessionData) {
  sessionInfo.style.display = "block";
  sessionNameEl.textContent = data.projectName || "—";
  tripleCountEl.textContent = String(data.tripleCount ?? "—");
  topicCountEl.textContent = String(data.topicCount ?? "—");

  if (projectNameInput && data.projectName) {
    projectNameInput.value = data.projectName;
  }

  if (data.sessionId) {
    currentSessionId = data.sessionId;
    unloadBtn.disabled = false;
  }
}

function updatePauseUI() {
  if (isPaused) {
    pauseToggleBtn.textContent = "▶️ Resume GLIA";
    pauseToggleBtn.classList.add("paused");
    gliaStatusBadge.textContent = "⏸ Paused";
    gliaStatusBadge.className = "glia-status paused";
  } else {
    pauseToggleBtn.textContent = "⏸ Pause GLIA";
    pauseToggleBtn.classList.remove("paused");
    gliaStatusBadge.textContent = currentSessionId ? "🟢 Active" : "⚪ No session";
    gliaStatusBadge.className = `glia-status ${currentSessionId ? "active" : "idle"}`;
  }
}

function setStatus(msg: string, type: "ok" | "error" | "warn" = "ok") {
  statusEl.textContent = msg;
  statusEl.className = type;
  if (type === "ok") setTimeout(() => (statusEl.textContent = ""), 6000);
}
