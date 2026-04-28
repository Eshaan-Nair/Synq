"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/platforms/claude.ts
  var claude;
  var init_claude = __esm({
    "src/platforms/claude.ts"() {
      "use strict";
      claude = {
        name: "claude",
        hostname: "claude.ai",
        userSelectors: [
          ".font-user-message",
          '[data-testid="user-message"]',
          ".human-turn",
          ".HumanTurn"
        ],
        responseSelectors: [
          // Confirmed from live DOM inspection (April 2025)
          ".font-claude-response",
          // inner content wrapper — confirmed present
          "[data-is-streaming]"
          // response container (streaming + done)
        ],
        inputSelectors: [
          // ProseMirror confirmed in DOM (BR.ProseMirror-trailingBreak visible)
          "div.ProseMirror",
          '[contenteditable="true"][data-placeholder]',
          '[contenteditable="true"]'
        ],
        sendButtonSelectors: [
          'button[aria-label="Send Message"]',
          'button[aria-label="Send message"]',
          'button[data-testid="send-button"]',
          'button[type="submit"]'
        ]
      };
    }
  });

  // src/platforms/chatgpt.ts
  var chatgpt;
  var init_chatgpt = __esm({
    "src/platforms/chatgpt.ts"() {
      "use strict";
      chatgpt = {
        name: "chatgpt",
        hostname: "chatgpt.com",
        userSelectors: [
          '[data-message-author-role="user"]',
          '[data-testid="user-message"]'
        ],
        responseSelectors: [
          "[data-message-author-role='assistant']",
          ".markdown.prose",
          ".agent-turn"
        ],
        inputSelectors: [
          "#prompt-textarea",
          '[contenteditable="true"]'
        ],
        sendButtonSelectors: [
          'button[data-testid="send-button"]',
          'button[aria-label="Send prompt"]'
        ]
      };
    }
  });

  // src/platforms/gemini.ts
  var gemini;
  var init_gemini = __esm({
    "src/platforms/gemini.ts"() {
      "use strict";
      gemini = {
        name: "gemini",
        hostname: "gemini.google.com",
        userSelectors: [
          // Gemini uses obfuscated classes — use multiple approaches
          ".query-text",
          ".user-query",
          ".query-content",
          "user-query",
          // custom web component tag
          "message-content[data-query-text]",
          // data attribute variant
          '[data-message-author="user"]',
          // Fallback: Gemini wraps user prompts in specific turn containers
          ".conversation-turn-user",
          "user-message"
          // custom element tag
        ],
        responseSelectors: [
          ".response-content",
          "model-response",
          ".model-response-text",
          "message-content"
          // custom element tag for responses
        ],
        inputSelectors: [
          ".ql-editor",
          'rich-textarea [contenteditable="true"]',
          'div[contenteditable="true"]',
          '[contenteditable="true"]'
        ],
        sendButtonSelectors: [
          'button[aria-label="Send message"]',
          ".send-button",
          "button.send-button"
        ]
      };
    }
  });

  // src/platforms/index.ts
  function detectPlatform() {
    const host = window.location.hostname;
    const match = platforms.find((p) => host.includes(p.hostname));
    return match?.name || "unknown";
  }
  function getPlatformConfig(platform) {
    return platforms.find((p) => p.name === platform) || null;
  }
  function queryAll(selectors) {
    const seen = /* @__PURE__ */ new Set();
    const results = [];
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          if (!seen.has(el)) {
            seen.add(el);
            results.push(el);
          }
        }
      } catch {
      }
    }
    return results.filter(
      (el) => !results.some((other) => other !== el && other.contains(el))
    );
  }
  function queryOne(selectors) {
    for (const sel of selectors) {
      try {
        const result = document.querySelector(sel);
        if (result) return result;
      } catch {
      }
    }
    return null;
  }
  var platforms;
  var init_platforms = __esm({
    "src/platforms/index.ts"() {
      "use strict";
      init_claude();
      init_chatgpt();
      init_gemini();
      platforms = [claude, chatgpt, gemini];
    }
  });

  // src/content.ts
  var require_content = __commonJS({
    "src/content.ts"() {
      init_platforms();
      if (window.__synqInitialised) {
        throw new Error("[SYNQ] Duplicate injection detected \u2014 skipping re-initialisation.");
      }
      window.__synqInitialised = true;
      var platform = detectPlatform();
      var config = getPlatformConfig(platform);
      var sessionId = null;
      var isPaused = false;
      var isProcessingPrompt = false;
      var lastSendTimestamp = 0;
      var synqShadow = null;
      var urlWatcherInterval = null;
      var seenMessageFingerprints = /* @__PURE__ */ new Set();
      function fnv1a(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
          hash ^= text.charCodeAt(i);
          hash = hash * 16777619 >>> 0;
        }
        return hash.toString(16);
      }
      function fingerprint(text) {
        return fnv1a(text.trim());
      }
      function addFingerprint(fp) {
        if (seenMessageFingerprints.size >= 1e3) {
          seenMessageFingerprints.clear();
        }
        seenMessageFingerprints.add(fp);
      }
      async function init() {
        seenMessageFingerprints.clear();
        console.log(`[SYNQ] active on: ${platform}`);
        const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
        if (activeData?.activeSession) {
          sessionId = activeData.activeSession._id;
          console.log(`[SYNQ] session: ${activeData.activeSession.projectName}`);
        } else {
          const stored = await getStoredSession();
          if (stored) {
            sessionId = stored.sessionId;
            console.log(`[SYNQ] session (stored): ${stored.projectName}`);
          }
        }
        const pauseData = await sendMessage({ type: "GET_PAUSE_STATE" });
        isPaused = pauseData?.paused === true;
        if (sessionId && config && !isPaused) {
          attachPromptInterceptor();
          console.log(`[SYNQ] auto-connected for session ${sessionId}`);
        }
        injectSidebarUI();
        updateBadge(!isPaused && !!sessionId);
        if (urlWatcherInterval !== null) clearInterval(urlWatcherInterval);
        let lastHref = window.location.href;
        urlWatcherInterval = setInterval(() => {
          if (window.location.href !== lastHref) {
            lastHref = window.location.href;
            handlePlatformChange();
          }
        }, 1e3);
        window.addEventListener("popstate", handlePlatformChange);
      }
      function handlePlatformChange() {
        const newPlatform = detectPlatform();
        if (newPlatform === platform) return;
        console.log(`[SYNQ] platform changed: ${platform} \u2192 ${newPlatform}`);
        detachPromptInterceptor();
        platform = newPlatform;
        config = getPlatformConfig(newPlatform);
        if (!isPaused && sessionId && config) {
          attachPromptInterceptor();
          console.log(`[SYNQ] re-attached interceptor on ${newPlatform}`);
        }
      }
      async function saveCurrentChat(projectName, providedSessionId) {
        if (!config) {
          return { success: false, topicsExtracted: 0, triplesExtracted: 0, error: "Unsupported platform" };
        }
        let userEls = queryAll(config.userSelectors);
        const assistantEls = queryAll(config.responseSelectors);
        console.log(`[SYNQ] scrape: ${userEls.length} user els, ${assistantEls.length} assistant els (platform: ${platform})`);
        if (userEls.length === 0 && assistantEls.length > 0) {
          console.log("[SYNQ] user selectors returned 0 \u2014 trying structural fallback");
          const foundUserEls = [];
          for (const assistantEl of assistantEls) {
            let parent = assistantEl.parentElement;
            for (let depth = 0; depth < 5 && parent; depth++) {
              const prev = parent.previousElementSibling;
              if (prev) {
                const prevText = prev.textContent?.trim() || "";
                if (prevText.length > 2 && prevText.length < 5e3 && !assistantEls.some((a) => a === prev || a.contains(prev) || prev.contains(a))) {
                  foundUserEls.push(prev);
                  break;
                }
              }
              parent = parent.parentElement;
            }
          }
          if (foundUserEls.length > 0) {
            userEls = foundUserEls;
            console.log(`[SYNQ] structural fallback found ${userEls.length} user element(s)`);
          }
        }
        if (userEls.length === 0) {
          const broadSelectors = [
            '[role="row"]',
            '[data-turn-role="user"]',
            '[aria-label*="You"]',
            '[aria-label*="your prompt"]',
            '[aria-label*="your message"]'
          ];
          for (const sel of broadSelectors) {
            try {
              const els = document.querySelectorAll(sel);
              if (els.length > 0) {
                userEls = Array.from(els);
                console.log(`[SYNQ] broad selector "${sel}" found ${userEls.length} user element(s)`);
                break;
              }
            } catch {
            }
          }
        }
        if (assistantEls.length === 0 && userEls.length === 0) {
          return {
            success: false,
            topicsExtracted: 0,
            triplesExtracted: 0,
            error: `No messages found on ${platform}. Make sure you're on a chat page with visible messages.`
          };
        }
        const tagged = [
          ...userEls.map((el) => ({ el, role: "user" })),
          ...assistantEls.map((el) => ({ el, role: "assistant" }))
        ];
        tagged.sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        const lines = [];
        for (const { el, role } of tagged) {
          let text = el.textContent?.trim() || "";
          if (text.length < 3) continue;
          text = text.replace(/^You said\s*/i, "").replace(/^Gemini said\s*/i, "").replace(/^ChatGPT said\s*/i, "").replace(/^Claude said\s*/i, "").trim();
          if (text.length < 3) continue;
          const fp = fingerprint(text);
          if (seenMessageFingerprints.has(fp)) continue;
          addFingerprint(fp);
          lines.push(`[${role === "user" ? "User" : "Assistant"}]: ${text}`);
        }
        if (lines.length === 0) {
          return { success: false, topicsExtracted: 0, triplesExtracted: 0, error: "No new content to save (already saved)" };
        }
        const rawText = lines.join("\n\n");
        console.log(`[SYNQ] saving ${rawText.length} chars, ${lines.length} turns...`);
        showToast("Saving chat...");
        let saveSessionId = providedSessionId;
        if (!saveSessionId) {
          const sessionData = await sendMessage({
            type: "CREATE_SESSION",
            payload: { projectName, platform }
          });
          if (!sessionData?.sessionId) {
            return {
              success: false,
              topicsExtracted: 0,
              triplesExtracted: 0,
              error: "Failed to create session. Is the backend running on port 3001?"
            };
          }
          saveSessionId = sessionData.sessionId;
        }
        sessionId = saveSessionId;
        const result = await sendMessage({
          type: "SAVE_CHAT",
          payload: { rawText, sessionId: saveSessionId, platform, messageCount: lines.length }
        });
        if (result?.error) {
          return { success: false, topicsExtracted: 0, triplesExtracted: 0, error: result.error };
        }
        const chunksStored = result?.chunksStored || result?.topicsExtracted || 0;
        const triplesExtracted = result?.triplesExtracted || 0;
        if (!isPaused && config) {
          attachPromptInterceptor();
          updateBadge(true);
          showToast(`Saved! ${chunksStored} chunks, ${triplesExtracted} facts. SYNQ is active.`);
        } else {
          showToast(`Saved! ${chunksStored} chunks, ${triplesExtracted} facts.`);
        }
        return { success: true, topicsExtracted: chunksStored, triplesExtracted, sessionId: saveSessionId ?? void 0 };
      }
      function attachPromptInterceptor() {
        if (!config) return;
        document.addEventListener("keydown", handlePromptKeydown, true);
        document.addEventListener("click", handleSendButtonClick, true);
        console.log("[SYNQ] interceptor attached");
      }
      function detachPromptInterceptor() {
        document.removeEventListener("keydown", handlePromptKeydown, true);
        document.removeEventListener("click", handleSendButtonClick, true);
        console.log("[SYNQ] interceptor detached");
      }
      async function handlePromptKeydown(e) {
        if (isPaused || isProcessingPrompt || !config) return;
        if (e.key !== "Enter" || e.shiftKey) return;
        const now = Date.now();
        if (now - lastSendTimestamp < 300) return;
        const input = queryOne(config.inputSelectors);
        if (!input || !document.activeElement?.closest(config.inputSelectors.join(","))) return;
        const promptText = input.textContent?.trim() || input.value?.trim() || "";
        if (!promptText || promptText.length < 5) return;
        lastSendTimestamp = now;
        e.preventDefault();
        e.stopPropagation();
        await processPromptWithRAG(promptText, input);
      }
      async function handleSendButtonClick(e) {
        if (isPaused || isProcessingPrompt || !config) return;
        const target = e.target;
        const isSendButton = config.sendButtonSelectors.some((sel) => target.closest(sel));
        if (!isSendButton) return;
        const now = Date.now();
        if (now - lastSendTimestamp < 300) return;
        const input = queryOne(config.inputSelectors);
        if (!input) return;
        const promptText = input.textContent?.trim() || input.value?.trim() || "";
        if (!promptText || promptText.length < 5) return;
        lastSendTimestamp = now;
        e.preventDefault();
        e.stopPropagation();
        await processPromptWithRAG(promptText, input);
      }
      async function processPromptWithRAG(promptText, input) {
        isProcessingPrompt = true;
        showToast("SYNQ searching memory...");
        try {
          const activeData = await sendMessage({ type: "GET_ACTIVE_SESSION" });
          const currentSessionId = activeData?.activeSession?._id || sessionId;
          if (!currentSessionId) {
            await injectAndSend(input, promptText);
            showToast("No session \u2014 save a chat first");
            return;
          }
          if (currentSessionId !== sessionId) {
            console.log(`[SYNQ] session refreshed: ${sessionId} \u2192 ${currentSessionId}`);
            sessionId = currentSessionId;
          }
          const result = await sendMessage({
            type: "RAG_RETRIEVE",
            payload: { prompt: promptText, sessionId: currentSessionId, topN: 3 }
          });
          if (result?.found && result?.contextBlock) {
            const contextualPrompt = buildRAGPrompt(result.contextBlock, promptText);
            await injectAndSend(input, contextualPrompt);
            const count = result?.chunksFound?.length ?? result?.chunks?.length ?? 0;
            showToast(`SYNQ recalled ${count} context chunk(s)`);
          } else {
            await injectAndSend(input, promptText);
            showToast("No matching context \u2014 sending normally");
          }
        } catch (err) {
          console.error("[SYNQ] RAG error:", err);
          await injectAndSend(input, promptText);
        } finally {
          isProcessingPrompt = false;
        }
      }
      function buildRAGPrompt(contextBlock, userPrompt) {
        return `[SYNQ: Relevant context from your previous session]
${contextBlock}
[END SYNQ CONTEXT]

${userPrompt}`;
      }
      async function injectAndSend(input, text) {
        input.focus();
        if (input.isContentEditable) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(input);
          selection?.removeAllRanges();
          selection?.addRange(range);
          const inserted = document.execCommand("insertText", false, text);
          if (!inserted) {
            try {
              await navigator.clipboard.writeText(text);
              document.execCommand("paste");
            } catch {
              input.innerText = text;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
        } else {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
          if (nativeSetter?.set) {
            nativeSetter.set.call(input, text);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        await new Promise((r) => setTimeout(r, 250));
        const sendBtn = queryOne(config.sendButtonSelectors);
        if (sendBtn) {
          sendBtn.click();
        } else {
          input.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true
          }));
        }
      }
      async function injectContext() {
        if (!sessionId) {
          showToast("No session loaded. Save a chat first.");
          return;
        }
        if (!config) {
          showToast("Unsupported platform.");
          return;
        }
        const data = await sendMessage({ type: "GET_CONTEXT", payload: { sessionId } });
        if (!data?.contextBlock || data.tripleCount === 0) {
          showToast("No context found.");
          return;
        }
        const prompt = `[SYNQ CONTEXT \u2014 Previous Session Knowledge]
${data.structuredSummary || data.contextBlock}
[END SYNQ CONTEXT]
---
`;
        const input = queryOne(config.inputSelectors);
        if (!input) {
          showToast("Could not find chat input. Click the input box first.");
          return;
        }
        input.focus();
        if (input.isContentEditable) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(input);
          selection?.removeAllRanges();
          selection?.addRange(range);
          const inserted = document.execCommand("insertText", false, prompt);
          if (!inserted) {
            input.innerText = prompt;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } else {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
          if (nativeSetter?.set) {
            nativeSetter.set.call(input, prompt);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        showToast(`Injected ${data.tripleCount} facts into chat`);
      }
      function injectSidebarUI() {
        if (document.getElementById("synq-sidebar-host")) return;
        const host = document.createElement("div");
        host.id = "synq-sidebar-host";
        document.body.appendChild(host);
        synqShadow = host.attachShadow({ mode: "open" });
        synqShadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600&display=swap');
    
    #synq-badge {
      position: fixed; bottom: 24px; right: 24px;
      background: #151822; color: #F8FAFC;
      padding: 10px 18px; border-radius: 8px;
      font-size: 12px; font-family: 'Inter', system-ui, sans-serif;
      font-weight: 600; cursor: pointer; z-index: 999999;
      border: 1px solid #1E2330;
      letter-spacing: 0.05em; transition: all 0.2s;
    }
    #synq-badge:hover { background: #1E2330; }
    #synq-badge.active {
      border-color: #6366F1;
      box-shadow: 0 0 0 1px #6366F1;
    }
    #synq-badge.paused { color: #475569; }
    #synq-toast {
      position: fixed; bottom: 76px; right: 24px;
      background: #0B0E14; color: #F8FAFC;
      padding: 10px 16px; border-radius: 6px;
      font-size: 12px; font-family: 'Inter', system-ui, sans-serif;
      z-index: 999999; opacity: 0;
      border: 1px solid #1E2330; transition: opacity 0.3s;
      pointer-events: none; max-width: 280px;
    }
  </style>
  <div id="synq-badge">SYNQ</div>
  <div id="synq-toast"></div>
  `;
      }
      function updateBadge(active) {
        if (!synqShadow) return;
        const badge = synqShadow.getElementById("synq-badge");
        if (!badge) return;
        badge.classList.remove("active", "paused");
        if (isPaused) {
          badge.textContent = "SYNQ OFF";
          badge.classList.add("paused");
        } else if (active) {
          badge.textContent = "SYNQ ON";
          badge.classList.add("active");
        } else {
          badge.textContent = "SYNQ";
        }
      }
      function showToast(message) {
        if (!synqShadow) return;
        const toast = synqShadow.getElementById("synq-toast");
        if (!toast) return;
        toast.textContent = message;
        toast.style.opacity = "1";
        setTimeout(() => toast.style.opacity = "0", 4e3);
      }
      function sendMessage(msg) {
        return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
      }
      async function getStoredSession() {
        return sendMessage({ type: "GET_SESSION" });
      }
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === "PING") {
          sendResponse({ ok: true });
          return true;
        }
        if (message.type === "SAVE_CHAT_FROM_POPUP") {
          seenMessageFingerprints.clear();
          const pl = message.payload;
          saveCurrentChat(pl.projectName, pl.sessionId).then(sendResponse);
          return true;
        }
        if (message.type === "INJECT_NOW") {
          injectContext().then(() => sendResponse({ ok: true }));
          return true;
        }
        if (message.type === "PAUSE_SYNQ") {
          isPaused = true;
          detachPromptInterceptor();
          updateBadge(false);
          showToast("SYNQ paused \u2014 context injection suspended");
          sendResponse({ ok: true });
          return true;
        }
        if (message.type === "RESUME_SYNQ") {
          isPaused = false;
          if (sessionId && config) {
            attachPromptInterceptor();
            updateBadge(true);
            showToast("SYNQ resumed \u2014 context injection active");
          }
          sendResponse({ ok: true });
          return true;
        }
        if (message.type === "SESSION_CHANGED") {
          const { sessionId: newId, projectName } = message.payload;
          if (newId && newId !== sessionId) {
            console.log(`[SYNQ] session updated via broadcast: ${sessionId} \u2192 ${newId} (${projectName})`);
            sessionId = newId;
            if (config && !isPaused) {
              attachPromptInterceptor();
              updateBadge(true);
            }
            showToast(`SYNQ: session updated to "${projectName}"`);
          }
          sendResponse({ ok: true });
          return true;
        }
      });
      init();
    }
  });
  require_content();
})();
