const status = document.getElementById("status");
const sessionInfo = document.getElementById("session-info");
const sessionName = document.getElementById("session-name");
const tripleCount = document.getElementById("triple-count");

// Load existing session on open
chrome.storage.local.get("synq_session", (result) => {
  if (result.synq_session) {
    showSession(result.synq_session);
  }
});

document.getElementById("create-btn").addEventListener("click", async () => {
  const projectName = document.getElementById("project-name").value.trim();
  const platform = document.getElementById("platform").value;

  if (!projectName) {
    status.textContent = "⚠ Enter a project name";
    return;
  }

  status.textContent = "Creating session...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "CREATE_SESSION_FROM_POPUP",
      payload: { projectName, platform },
    },
    (response) => {
      if (response?.sessionId) {
        showSession(response);
        status.textContent = "✅ Session started!";
      } else {
        status.textContent = "❌ Failed. Is backend running?";
      }
    }
  );
});

document.getElementById("inject-btn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "INJECT_NOW" });
  status.textContent = "🧠 Injecting context...";
});

document.getElementById("create-btn").addEventListener("click", async () => {
  const projectName = document.getElementById("project-name").value.trim();
  const platform = document.getElementById("platform").value;

  if (!projectName) {
    status.textContent = "⚠ Enter a project name";
    return;
  }

  status.textContent = "Creating session...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    status.textContent = "❌ No active tab found";
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "CREATE_SESSION_FROM_POPUP",
      payload: { projectName, platform },
    },
    (response) => {
      if (response?.sessionId) {
        showSession(response);
        status.textContent = "✅ Session started!";
      } else {
        status.textContent = "❌ Failed. Is backend running?";
      }
    }
  );
});

function showSession(data) {
  sessionInfo.style.display = "block";
  sessionName.textContent = data.projectName;
  tripleCount.textContent = data.tripleCount ?? "—";
}