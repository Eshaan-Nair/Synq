const statusEl = document.getElementById("status");
const sessionInfo = document.getElementById("session-info");
const sessionNameEl = document.getElementById("session-name");
const tripleCountEl = document.getElementById("triple-count");
const captureBtn = document.getElementById("capture-btn");
const injectBtn = document.getElementById("inject-btn");
const detectedPlatformEl = document.getElementById("detected-platform");

// Auto detect platform from current tab URL
async function detectPlatformFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (url.includes("claude.ai")) return "claude";
  if (url.includes("chatgpt.com")) return "chatgpt";
  if (url.includes("gemini.google.com")) return "gemini";
  return "unknown";
}

// Boot — detect platform and load session
(async () => {
  const platform = await detectPlatformFromTab();
  detectedPlatformEl.textContent = platform === "unknown"
    ? "Not on an AI platform"
    : platform.charAt(0).toUpperCase() + platform.slice(1);

  // Check backend for active session first
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_SESSION" }, (response) => {
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

// Capture Chat
captureBtn.addEventListener("click", async () => {
  const projectName = document.getElementById("project-name").value.trim();
  if (!projectName) {
    setStatus("⚠ Enter a project name first", "error");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("❌ No active tab found", "error");
    return;
  }

  const platform = await detectPlatformFromTab();
  if (platform === "unknown") {
    setStatus("❌ Open an AI chat first", "error");
    return;
  }

  captureBtn.disabled = true;
  setStatus("Extracting Context...");

  chrome.tabs.sendMessage(
    tab.id,
    { type: "CAPTURE_CHAT", payload: { projectName, platform } },
    (response) => {
      captureBtn.disabled = false;
      if (!response) {
        setStatus("❌ Failed. Is backend running?", "error");
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
        setStatus(`Extracted ${response.triplesExtracted} facts!`);
      }
    }
  );
});

// Inject Context Now
injectBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("❌ No active tab found", "error");
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "INJECT_NOW" }, () => {
    setStatus("Injecting context...");
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
    setTimeout(() => (statusEl.textContent = ""), 4000);
  }
}