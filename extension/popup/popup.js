const statusEl = document.getElementById("status");
const sessionInfo = document.getElementById("session-info");
const sessionNameEl = document.getElementById("session-name");
const tripleCountEl = document.getElementById("triple-count");
const captureBtn = document.getElementById("capture-btn");
const injectBtn = document.getElementById("inject-btn");
const detectedPlatformEl = document.getElementById("detected-platform");

const PLATFORM_LABELS = {
  claude: "Claude (claude.ai)",
  chatgpt: "ChatGPT (chatgpt.com)",
  gemini: "Gemini (gemini.google.com)",
};

async function detectPlatformFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (url.includes("claude.ai")) return "claude";
  if (url.includes("chatgpt.com")) return "chatgpt";
  if (url.includes("gemini.google.com")) return "gemini";
  return "unknown";
}

(async () => {
  const platform = await detectPlatformFromTab();

  if (platform === "unknown") {
    detectedPlatformEl.textContent = "Not on a supported AI platform";
    detectedPlatformEl.style.color = "#ff6b6b";
    captureBtn.disabled = true;
    captureBtn.title = "Open Claude, ChatGPT, or Gemini first";
  } else {
    detectedPlatformEl.textContent = PLATFORM_LABELS[platform] || platform;
    detectedPlatformEl.style.color = "";
  }

  // Check backend for active session first, fall back to chrome.storage
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_SESSION" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("⚠ Could not reach background service worker", "error");
      return;
    }
    if (response?.activeSession) {
      showSession({
        sessionId: response.activeSession._id,
        projectName: response.activeSession.projectName,
        tripleCount: response.activeSession.tripleCount,
      });
    } else {
      chrome.storage.local.get("synq_session", (result) => {
        if (result.synq_session) showSession(result.synq_session);
      });
    }
  });
})();

captureBtn.addEventListener("click", async () => {
  const projectNameInput = document.getElementById("project-name");
  const projectName = projectNameInput.value.trim();

  if (!projectName) {
    setStatus("⚠ Enter a project name first", "error");
    projectNameInput.focus();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("❌ No active tab found", "error");
    return;
  }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") {
    setStatus("❌ Open Claude, ChatGPT, or Gemini first", "error");
    return;
  }

  captureBtn.disabled = true;
  captureBtn.textContent = "Extracting...";
  setStatus("Sending to SYNQ backend...");

  chrome.tabs.sendMessage(
    tab.id,
    { type: "CAPTURE_CHAT", payload: { projectName, platform } },
    (response) => {
      captureBtn.disabled = false;
      captureBtn.textContent = "Extract Context";

      if (chrome.runtime.lastError || !response) {
        setStatus(
          "❌ Could not reach content script. Is the backend running? Try refreshing the page.",
          "error"
        );
        return;
      }
      if (response.error) {
        setStatus(`❌ ${response.error}`, "error");
        return;
      }
      if (response.success) {
        const sessionData = {
          sessionId: response.sessionId,
          projectName,
          tripleCount: response.triplesExtracted,
        };
        chrome.storage.local.set({ synq_session: sessionData });
        showSession(sessionData);
        setStatus(
          response.triplesExtracted === 0
            ? "⚠ Done, but 0 facts extracted. The platform selector may be outdated — open an issue on GitHub."
            : `✅ Extracted ${response.triplesExtracted} facts!`
        );
      }
    }
  );
});

injectBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("❌ No active tab found", "error");
    return;
  }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") {
    setStatus("❌ Open Claude, ChatGPT, or Gemini first", "error");
    return;
  }

  setStatus("Injecting context...");
  chrome.tabs.sendMessage(tab.id, { type: "INJECT_NOW" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setStatus("❌ Could not inject. Try clicking the chat input box first, then retry.", "error");
    }
  });
});

function showSession(data) {
  sessionInfo.style.display = "block";
  sessionNameEl.textContent = data.projectName || "—";
  tripleCountEl.textContent = data.tripleCount ?? "—";
}

function setStatus(msg, type = "ok") {
  statusEl.textContent = msg;
  statusEl.className = type === "error" ? "error" : "";
  if (type !== "error") {
    setTimeout(() => (statusEl.textContent = ""), 5000);
  }
}