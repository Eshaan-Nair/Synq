// popup.ts — v1.2
// Replaced Connect/Disconnect with a Pause toggle
// Auto-connect happens in content.ts on init — popup only shows state + pause control

type Platform = "claude" | "chatgpt" | "gemini" | "deepseek" | "unknown";

interface SessionData {
  sessionId: string;
  projectName: string;
  tripleCount?: number;
  topicCount?: number;
}

const statusEl           = document.getElementById("status")           as HTMLElement;
const sessionInfo        = document.getElementById("session-info")     as HTMLElement;
const sessionNameEl      = document.getElementById("session-name")     as HTMLElement;
const tripleCountEl      = document.getElementById("triple-count")     as HTMLElement;
const topicCountEl       = document.getElementById("topic-count")      as HTMLElement;
const saveBtn            = document.getElementById("save-btn")         as HTMLButtonElement;
const pauseToggleBtn     = document.getElementById("pause-toggle-btn") as HTMLButtonElement;
const unloadBtn          = document.getElementById("unload-btn")       as HTMLButtonElement;
const injectBtn          = document.getElementById("inject-btn")       as HTMLButtonElement;
const detectedPlatformEl = document.getElementById("detected-platform") as HTMLElement;
const platformDot        = document.getElementById("platform-dot")     as HTMLElement;
const synqStatusBadge    = document.getElementById("synq-status-badge") as HTMLElement;

const PLATFORM_LABELS: Record<Platform, string> = {
  claude:  "Claude (claude.ai)",
  chatgpt: "ChatGPT (chatgpt.com)",
  gemini:  "Gemini (gemini.google.com)",
  deepseek: "DeepSeek (chat.deepseek.com)",
  unknown: "Not on a supported platform",
};

let currentSessionId: string | null = null;
let isPaused = false;

async function detectPlatformFromTab(): Promise<Platform> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (url.includes("claude.ai"))         return "claude";
  if (url.includes("chatgpt.com"))       return "chatgpt";
  if (url.includes("gemini.google.com")) return "gemini";
  if (url.includes("deepseek.com"))      return "deepseek";
  return "unknown";
}

async function getTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function isContentScriptReady(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "PING" }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  if (await isContentScriptReady(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["dist/content.js"] });
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (err) {
    console.error("[SYNQ popup] Could not inject content script:", err);
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
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_SESSION" }, (response) => {
      if (response?.activeSession) {
        showSession({
          sessionId:   response.activeSession._id as string,
          projectName: response.activeSession.projectName as string,
          tripleCount: response.activeSession.tripleCount as number,
          topicCount:  response.activeSession.topicCount  as number,
        });
      } else {
        chrome.storage.local.get("synq_session", (result) => {
          if (result.synq_session) showSession(result.synq_session as SessionData);
          resolve();
        });
        return; // resolve is called in the nested callback
      }
      resolve();
    });
  });

  const pausePromise = new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PAUSE_STATE" }, (response) => {
      isPaused = response?.paused === true;
      resolve();
    });
  });

  // Wait for both, then update the UI
  await Promise.all([sessionPromise, pausePromise]);
  pauseToggleBtn.disabled = false; // Always allow pausing/resuming
  updatePauseUI();
})();

// ── Save Chat ─────────────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  const projectNameInput = document.getElementById("project-name") as HTMLInputElement;
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
  
  // Check if we already have a session for this specific URL
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = activeTab?.url || "";
  let existingSessionId: string | undefined;
  
  if (tabUrl) {
    const result = await chrome.storage.local.get("synq_url_map");
    const urlMap = (result.synq_url_map || {}) as Record<string, string>;
    existingSessionId = urlMap[tabUrl];
    if (existingSessionId) {
      console.log(`[SYNQ popup] found existing sessionId for this URL: ${existingSessionId}`);
    }
  }

  const sessionResult = await new Promise<any>((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CREATE_SESSION", payload: { projectName, platform, sessionId: existingSessionId } },
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
    if (sessionResult?.error === "Session not found" && existingSessionId) {
      console.warn(`[SYNQ popup] session ${existingSessionId} not found on backend. Clearing mapping and retrying...`);
      
      // Clear mapping and retry creation
      if (tabUrl) {
        const urlMapResult = await chrome.storage.local.get("synq_url_map");
        const urlMap = (urlMapResult.synq_url_map || {}) as Record<string, string>;
        delete urlMap[tabUrl];
        await chrome.storage.local.set({ synq_url_map: urlMap });
      }

      // Recursive call to try again without existingSessionId
      // Alternatively, we could just copy the creation logic here, but let's just trigger a second attempt
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
      
      // Update sessionResult so we proceed with the new one
      sessionResult.sessionId = retryResult.sessionId;
    } else {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Save Chat";
      setStatus(`❌ ${sessionResult?.error || "Failed to create session. Is the backend running on port 3001?"}`, "error");
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
          sessionId:   sessionResult.sessionId as string,
          projectName,
          tripleCount: response.triplesExtracted as number,
          topicCount:  response.topicsExtracted  as number,
        };
        chrome.storage.local.set({ synq_session: sessionData });
        
        // Save the URL -> sessionId mapping so we update instead of create next time
        if (tabUrl) {
          chrome.storage.local.get("synq_url_map", (result) => {
            const urlMap = (result.synq_url_map || {}) as Record<string, string>;
            urlMap[tabUrl] = sessionResult.sessionId;
            chrome.storage.local.set({ synq_url_map: urlMap });
          });
        }

        showSession(sessionData);
        const chunks = response.topicsExtracted as number;
        const facts  = response.triplesExtracted as number;
        setStatus(`✅ Saved! ${chunks} chunks stored, ${facts} facts extracted. SYNQ auto-connected.`);

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
    chrome.tabs.sendMessage(tabId, { type: isPaused ? "PAUSE_SYNQ" : "RESUME_SYNQ" }, () => {});
  }

  setStatus(isPaused ? "⏸ SYNQ paused" : "▶️ SYNQ resumed");
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
      chrome.storage.local.remove("synq_session");
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
  sessionNameEl.textContent  = data.projectName   || "—";
  tripleCountEl.textContent  = String(data.tripleCount ?? "—");
  topicCountEl.textContent   = String(data.topicCount  ?? "—");
  if (data.sessionId) {
    currentSessionId = data.sessionId;
    unloadBtn.disabled = false;
  }
}

function updatePauseUI() {
  if (isPaused) {
    pauseToggleBtn.textContent = "▶️ Resume SYNQ";
    pauseToggleBtn.classList.add("paused");
    synqStatusBadge.textContent = "⏸ Paused";
    synqStatusBadge.className = "synq-status paused";
  } else {
    pauseToggleBtn.textContent = "⏸ Pause SYNQ";
    pauseToggleBtn.classList.remove("paused");
    synqStatusBadge.textContent = currentSessionId ? "🟢 Active" : "⚪ No session";
    synqStatusBadge.className = `synq-status ${currentSessionId ? "active" : "idle"}`;
  }
}

function setStatus(msg: string, type: "ok" | "error" | "warn" = "ok") {
  statusEl.textContent = msg;
  statusEl.className   = type;
  if (type === "ok") setTimeout(() => (statusEl.textContent = ""), 6000);
}
