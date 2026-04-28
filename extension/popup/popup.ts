// popup.ts — v1.2
// Replaced Connect/Disconnect with a Pause toggle
// Auto-connect happens in content.ts on init — popup only shows state + pause control

type Platform = "claude" | "chatgpt" | "gemini" | "unknown";

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
const injectBtn          = document.getElementById("inject-btn")       as HTMLButtonElement;
const detectedPlatformEl = document.getElementById("detected-platform") as HTMLElement;
const platformDot        = document.getElementById("platform-dot")     as HTMLElement;
const synqStatusBadge    = document.getElementById("synq-status-badge") as HTMLElement;

const PLATFORM_LABELS: Record<Platform, string> = {
  claude:  "Claude (claude.ai)",
  chatgpt: "ChatGPT (chatgpt.com)",
  gemini:  "Gemini (gemini.google.com)",
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
    pauseToggleBtn.disabled = true;
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

  // Wait for both, then update the badge correctly
  await Promise.all([sessionPromise, pausePromise]);
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
  if (platform === "unknown") { setStatus("❌ Open Claude, ChatGPT, or Gemini first", "error"); return; }

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

  // Step 1: Create session from popup → background (this path is reliable)
  setStatus("Creating session...");
  const sessionResult = await new Promise<any>((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CREATE_SESSION", payload: { projectName, platform } },
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
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 Save Chat";
    setStatus(`❌ ${sessionResult?.error || "Failed to create session. Is the backend running on port 3001?"}`, "error");
    return;
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
        showSession(sessionData);
        pauseToggleBtn.disabled = false;
        const chunks = response.topicsExtracted as number;
        const facts  = response.triplesExtracted as number;
        setStatus(`✅ Saved! ${chunks} chunks stored, ${facts} facts extracted. SYNQ auto-connected.`);
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

// ── Inject Context (one-time) ─────────────────────────────────────
injectBtn.addEventListener("click", async () => {
  const tabId = await getTabId();
  if (!tabId) { setStatus("❌ No active tab", "error"); return; }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") { setStatus("❌ Open Claude, ChatGPT, or Gemini first", "error"); return; }

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
    pauseToggleBtn.disabled = false;
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
