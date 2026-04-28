"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // popup/popup.ts
  var require_popup = __commonJS({
    "popup/popup.ts"() {
      var statusEl = document.getElementById("status");
      var sessionInfo = document.getElementById("session-info");
      var sessionNameEl = document.getElementById("session-name");
      var tripleCountEl = document.getElementById("triple-count");
      var topicCountEl = document.getElementById("topic-count");
      var saveBtn = document.getElementById("save-btn");
      var pauseToggleBtn = document.getElementById("pause-toggle-btn");
      var injectBtn = document.getElementById("inject-btn");
      var detectedPlatformEl = document.getElementById("detected-platform");
      var platformDot = document.getElementById("platform-dot");
      var synqStatusBadge = document.getElementById("synq-status-badge");
      var PLATFORM_LABELS = {
        claude: "Claude (claude.ai)",
        chatgpt: "ChatGPT (chatgpt.com)",
        gemini: "Gemini (gemini.google.com)",
        unknown: "Not on a supported platform"
      };
      var currentSessionId = null;
      var isPaused = false;
      async function detectPlatformFromTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url || "";
        if (url.includes("claude.ai")) return "claude";
        if (url.includes("chatgpt.com")) return "chatgpt";
        if (url.includes("gemini.google.com")) return "gemini";
        return "unknown";
      }
      async function getTabId() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab?.id ?? null;
      }
      async function isContentScriptReady(tabId) {
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { type: "PING" }, () => {
            resolve(!chrome.runtime.lastError);
          });
        });
      }
      async function ensureContentScript(tabId) {
        if (await isContentScriptReady(tabId)) return true;
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ["dist/content.js"] });
          await new Promise((r) => setTimeout(r, 500));
          return true;
        } catch (err) {
          console.error("[SYNQ popup] Could not inject content script:", err);
          return false;
        }
      }
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
        const sessionPromise = new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_ACTIVE_SESSION" }, (response) => {
            if (response?.activeSession) {
              showSession({
                sessionId: response.activeSession._id,
                projectName: response.activeSession.projectName,
                tripleCount: response.activeSession.tripleCount,
                topicCount: response.activeSession.topicCount
              });
            } else {
              chrome.storage.local.get("synq_session", (result) => {
                if (result.synq_session) showSession(result.synq_session);
                resolve();
              });
              return;
            }
            resolve();
          });
        });
        const pausePromise = new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_PAUSE_STATE" }, (response) => {
            isPaused = response?.paused === true;
            resolve();
          });
        });
        await Promise.all([sessionPromise, pausePromise]);
        updatePauseUI();
      })();
      saveBtn.addEventListener("click", async () => {
        const projectNameInput = document.getElementById("project-name");
        const projectName = projectNameInput.value.trim();
        if (!projectName) {
          setStatus("\u26A0 Enter a session name first", "error");
          return;
        }
        const tabId = await getTabId();
        if (!tabId) {
          setStatus("\u274C No active tab", "error");
          return;
        }
        const platform = await detectPlatformFromTab();
        if (platform === "unknown") {
          setStatus("\u274C Open Claude, ChatGPT, or Gemini first", "error");
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "\u23F3 Saving...";
        setStatus("Checking content script...");
        const ready = await ensureContentScript(tabId);
        if (!ready) {
          saveBtn.disabled = false;
          saveBtn.textContent = "\u{1F4BE} Save Chat";
          setStatus("\u274C Could not load content script. Try refreshing the page.", "error");
          return;
        }
        setStatus("Creating session...");
        const sessionResult = await new Promise((resolve) => {
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
          saveBtn.textContent = "\u{1F4BE} Save Chat";
          setStatus(`\u274C ${sessionResult?.error || "Failed to create session. Is the backend running on port 3001?"}`, "error");
          return;
        }
        setStatus("Scraping chat...");
        chrome.tabs.sendMessage(
          tabId,
          { type: "SAVE_CHAT_FROM_POPUP", payload: { projectName, platform, sessionId: sessionResult.sessionId } },
          (response) => {
            saveBtn.disabled = false;
            saveBtn.textContent = "\u{1F4BE} Save Chat";
            if (chrome.runtime.lastError || !response) {
              setStatus("\u274C Lost connection to content script. Refresh and try again.", "error");
              return;
            }
            if (response.error) {
              setStatus(`\u274C ${response.error}`, "error");
              return;
            }
            if (response.success) {
              currentSessionId = sessionResult.sessionId;
              const sessionData = {
                sessionId: sessionResult.sessionId,
                projectName,
                tripleCount: response.triplesExtracted,
                topicCount: response.topicsExtracted
              };
              chrome.storage.local.set({ synq_session: sessionData });
              showSession(sessionData);
              pauseToggleBtn.disabled = false;
              const chunks = response.topicsExtracted;
              const facts = response.triplesExtracted;
              setStatus(`\u2705 Saved! ${chunks} chunks stored, ${facts} facts extracted. SYNQ auto-connected.`);
            }
          }
        );
      });
      pauseToggleBtn.addEventListener("click", async () => {
        const tabId = await getTabId();
        if (!tabId) return;
        isPaused = !isPaused;
        updatePauseUI();
        chrome.runtime.sendMessage({ type: "SET_PAUSE_STATE", payload: { paused: isPaused } });
        const ready = await ensureContentScript(tabId);
        if (ready) {
          chrome.tabs.sendMessage(tabId, { type: isPaused ? "PAUSE_SYNQ" : "RESUME_SYNQ" }, () => {
          });
        }
        setStatus(isPaused ? "\u23F8 SYNQ paused" : "\u25B6\uFE0F SYNQ resumed");
      });
      injectBtn.addEventListener("click", async () => {
        const tabId = await getTabId();
        if (!tabId) {
          setStatus("\u274C No active tab", "error");
          return;
        }
        const platform = await detectPlatformFromTab();
        if (platform === "unknown") {
          setStatus("\u274C Open Claude, ChatGPT, or Gemini first", "error");
          return;
        }
        const ready = await ensureContentScript(tabId);
        if (!ready) {
          setStatus("\u274C Could not reach page. Refresh and try again.", "error");
          return;
        }
        setStatus("Injecting context...");
        chrome.tabs.sendMessage(tabId, { type: "INJECT_NOW" }, (response) => {
          if (chrome.runtime.lastError || !response) {
            setStatus("\u274C Injection failed. Click the chat input first, then retry.", "error");
          }
        });
      });
      function showSession(data) {
        sessionInfo.style.display = "block";
        sessionNameEl.textContent = data.projectName || "\u2014";
        tripleCountEl.textContent = String(data.tripleCount ?? "\u2014");
        topicCountEl.textContent = String(data.topicCount ?? "\u2014");
        if (data.sessionId) {
          currentSessionId = data.sessionId;
          pauseToggleBtn.disabled = false;
        }
      }
      function updatePauseUI() {
        if (isPaused) {
          pauseToggleBtn.textContent = "\u25B6\uFE0F Resume SYNQ";
          pauseToggleBtn.classList.add("paused");
          synqStatusBadge.textContent = "\u23F8 Paused";
          synqStatusBadge.className = "synq-status paused";
        } else {
          pauseToggleBtn.textContent = "\u23F8 Pause SYNQ";
          pauseToggleBtn.classList.remove("paused");
          synqStatusBadge.textContent = currentSessionId ? "\u{1F7E2} Active" : "\u26AA No session";
          synqStatusBadge.className = `synq-status ${currentSessionId ? "active" : "idle"}`;
        }
      }
      function setStatus(msg, type = "ok") {
        statusEl.textContent = msg;
        statusEl.className = type;
        if (type === "ok") setTimeout(() => statusEl.textContent = "", 6e3);
      }
    }
  });
  require_popup();
})();
