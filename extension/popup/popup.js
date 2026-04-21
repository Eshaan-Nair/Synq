const statusEl = document.getElementById("status");
const sessionInfo = document.getElementById("session-info");
const sessionNameEl = document.getElementById("session-name");
const tripleCountEl = document.getElementById("triple-count");
const sessionIdDisplay = document.getElementById("session-id-display");
const captureBtn = document.getElementById("capture-btn");
const injectBtn = document.getElementById("inject-btn");

// Load existing session on popup open
chrome.storage.local.get("synq_session", (result) => {
  if (result.synq_session) {
    showSession(result.synq_session);
  }
});

// Capture Chat button
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

  captureBtn.disabled = true;
  setStatus("📸 Capturing chat...");

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "CAPTURE_CHAT",
      payload: { projectName },
    },
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
        // Save to chrome storage so inject works later
        const sessionData = {
          sessionId: response.sessionId,
          projectName,
          tripleCount: response.triplesExtracted,
        };
        chrome.storage.local.set({ synq_session: sessionData });
        showSession(sessionData);
        setStatus(`✅ Captured ${response.triplesExtracted} facts!`);
      }
    }
  );
});

// Inject Context Now button
injectBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    setStatus("❌ No active tab found", "error");
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "INJECT_NOW" }, () => {
    setStatus("🧠 Injecting context...");
  });
});

function showSession(data) {
  sessionInfo.style.display = "block";
  sessionNameEl.textContent = data.projectName || "—";
  tripleCountEl.textContent = data.tripleCount ?? "—";
  sessionIdDisplay.textContent = data.sessionId
    ? data.sessionId.toString().slice(0, 16) + "..."
    : "—";
}

function setStatus(msg, type = "ok") {
  statusEl.textContent = msg;
  statusEl.className = type === "error" ? "error" : "";
  if (type !== "error") {
    setTimeout(() => (statusEl.textContent = ""), 4000);
  }
}