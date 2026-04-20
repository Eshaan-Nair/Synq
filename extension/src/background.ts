// Service worker — handles all communication between
// content script and the SYNQ backend

const BACKEND = "http://localhost:3001";

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "INGEST_TEXT") {
    handleIngest(message.payload).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (message.type === "GET_CONTEXT") {
    handleGetContext(message.payload.sessionId).then(sendResponse);
    return true;
  }

  if (message.type === "CREATE_SESSION") {
    handleCreateSession(message.payload).then(sendResponse);
    return true;
  }

  if (message.type === "GET_SESSION") {
    handleGetStoredSession().then(sendResponse);
    return true;
  }
});

async function handleIngest(payload: {
  text: string;
  sessionId: string;
  platform: string;
}) {
  try {
    const res = await fetch(`${BACKEND}/api/context/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error("SYNQ ingest failed:", err);
    return { error: "Backend unreachable" };
  }
}

async function handleGetContext(sessionId: string) {
  try {
    const res = await fetch(`${BACKEND}/api/context/retrieve/${sessionId}`);
    return await res.json();
  } catch (err) {
    console.error("SYNQ retrieve failed:", err);
    return { error: "Backend unreachable" };
  }
}

async function handleCreateSession(payload: {
  projectName: string;
  platform: string;
}) {
  try {
    const res = await fetch(`${BACKEND}/api/context/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    // Persist session in chrome.storage so it survives tab changes
    await chrome.storage.local.set({ synq_session: data });
    return data;
  } catch (err) {
    console.error("SYNQ session creation failed:", err);
    return { error: "Backend unreachable" };
  }
}

async function handleGetStoredSession() {
  const result = await chrome.storage.local.get("synq_session");
  return result.synq_session || null;
}