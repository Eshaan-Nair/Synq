import { useEffect, useState, useCallback, useRef } from "react";
import GraphView from "./components/GraphView";
import ChatViewer from "./components/ChatViewer";
import { fetchGraphBySession, fetchContext, fetchSessions, setActiveSession as setActiveSessionOnBackend, deleteSession, extractErrorMessage } from "./api/synq";
import { fetchFullChat } from "./api/rag";



interface Node { id: string; type: string; }
interface Link { source: string; target: string; relation: string; }
interface Triple {
  subject: string; subjectType: string;
  relation: string;
  object: string; objectType: string;
  timestamp: string;
}
interface Session {
  _id: string;
  projectName: string;
  platform: string;
  tripleCount: number;
  topicCount?: number;
  hasFullChat?: boolean;
  createdAt: string;
  updatedAt: string;
}
interface ChatData {
  rawText: string;
  messageCount: number;
  createdAt: string;
}

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"graph" | "history" | "chat">("graph");
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadedToExtension, setLoadedToExtension] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Issue #17 Fix: Track whether the user is actively loading a session.
  const isLoadingSessionRef = useRef(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
      setError(null);
    } catch (err) {
      setError(`Backend unreachable: ${extractErrorMessage(err)}`);
    }
  }, []);

  const loadSession = useCallback(async (session: Session) => {
    setActiveSession(session);
    setLoadingSession(true);
    setChatData(null);
    isLoadingSessionRef.current = true;
    try {
      const [graphData, contextData, chatResult] = await Promise.all([
        fetchGraphBySession(session._id),
        fetchContext(session._id),
        fetchFullChat(session._id),
      ]);
      setNodes(graphData.nodes);
      setLinks(graphData.links);
      setTriples(contextData.triples || []);
      if (chatResult.found) {
        setChatData({
          rawText: chatResult.rawText || "",
          messageCount: chatResult.messageCount || 0,
          createdAt: chatResult.createdAt || "",
        });
      }
    } catch (err) {
      console.error(`Failed to load session: ${extractErrorMessage(err)}`);
    } finally {
      setLoadingSession(false);
      isLoadingSessionRef.current = false;
    }
  }, []);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const wasActive = activeSession?._id === sessionId;
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      if (wasActive) {
        setActiveSession(null);
        setNodes([]);
        setLinks([]);
        setTriples([]);
        setChatData(null);
      }
      const data = await fetchSessions();
      setSessions(data.sessions);
      if (wasActive && data.sessions.length > 0) {
        await loadSession(data.sessions[0]);
      }
    } catch {
      console.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  // FIX (Bug #1): setState calls wrapped in setTimeout to avoid synchronous
  // setState within an effect body, which can trigger cascading renders.
  // FIX (Bug #2): Added `activeSession` to the dependency array.
  useEffect(() => {
    if (sessions.length === 0) {
      const id = setTimeout(() => {
        setActiveSession(null);
        setNodes([]);
        setLinks([]);
        setTriples([]);
        setChatData(null);
      }, 0);
      return () => clearTimeout(id);
    }
    if (isLoadingSessionRef.current) return;
    if (activeSession) {
      const stillExists = sessions.find(s => s._id === activeSession._id);
      if (!stillExists) loadSession(sessions[0]);
    } else {
      loadSession(sessions[0]);
    }
  }, [sessions, loadSession, activeSession]); // activeSession added to deps

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  return (
    <div className="layout-container">
      {/* Error Banner */}
      {error && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "#7f1d1d",
          color: "#fca5a5",
          padding: "10px 20px",
          fontSize: "13px",
          zIndex: 9999,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>⚠ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: "16px" }}
          >✕</button>
        </div>
      )}

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <div className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-title">SYNQ</div>
          <div className="sidebar-subtitle">Context Sovereignty Engine</div>
        </div>

        {/* Session list */}
        <div className="session-list">
          {sessions.length === 0 ? (
            <div className="empty-state">
              No sessions yet.
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = activeSession?._id === s._id;
              return (
                <div
                  key={s._id}
                  className={`session-item ${isActive ? "active" : ""}`}
                  onClick={() => loadSession(s)}
                  onMouseEnter={(e) => {
                    const btn = (e.currentTarget as HTMLElement).querySelector(".delete-btn") as HTMLElement;
                    if (btn) btn.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    const btn = (e.currentTarget as HTMLElement).querySelector(".delete-btn") as HTMLElement;
                    if (btn) btn.style.opacity = "0";
                  }}
                >
                  <div className="session-header">
                    <div className="session-name">
                      {s.projectName}
                    </div>
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDelete(e, s._id)}
                      style={{ opacity: 0 }}
                      title="Delete session"
                    >
                      {deletingId === s._id ? "..." : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>}
                    </button>
                  </div>
                  <div className="session-meta">
                    <div className="session-stats">
                      <span>{s.tripleCount} facts</span>
                      {s.topicCount ? <span>{s.topicCount} topics</span> : null}
                    </div>
                    <span className="session-platform">{s.platform}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div className="main-content" style={{ flexDirection: "column" }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 28px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}>
          <div>
            {activeSession ? (
              <>
                <span style={{ color: "var(--text-main)", fontSize: "20px", fontWeight: "700" }}>
                  {activeSession.projectName}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "14px", marginLeft: "14px" }}>
                  {activeSession.tripleCount} facts
                  {activeSession.topicCount ? ` · ${activeSession.topicCount} topics` : ""}
                  {" · "}{activeSession.platform}
                </span>
              </>
            ) : (
              <span style={{ color: "var(--text-dim)", fontSize: "16px" }}>No session selected</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {activeSession && (
              <button
                onClick={async () => {
                  await setActiveSessionOnBackend(activeSession._id);
                  setLoadedToExtension(true);
                  setTimeout(() => setLoadedToExtension(false), 3000);
                }}
                style={{
                  background: loadedToExtension ? "var(--success)" : "var(--surface)",
                  color: loadedToExtension ? "#000" : "var(--text-main)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {loadedToExtension ? "Loaded!" : "Load into Extension"}
              </button>
            )}

            <div style={{ display: "flex", gap: "24px", fontSize: "13px", color: "var(--text-muted)" }}>
              <span>Nodes: <strong style={{ color: "var(--text-main)" }}>{nodes.length}</strong></span>
              <span>Edges: <strong style={{ color: "var(--text-main)", fontSize: "16px" }}>{links.length}</strong></span>
              <span>Facts: <strong style={{ color: "var(--text-main)", fontSize: "16px" }}>{triples.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-header">
          {(["graph", "history", "chat"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            >
              {tab === "graph" ? "Graph" : tab === "history" ? "History" : "Chat"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="tab-content">

          {/* Graph tab */}
          {activeTab === "graph" && (
            <div className="graph-wrapper">
              {loadingSession ? (
                <div style={{ padding: "32px", height: "100%", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", gap: "24px", height: "100%", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                    {[80, 120, 60, 100, 90, 70].map((size, i) => (
                      <div key={i} className="skeleton-box skeleton-pulse" style={{
                        width: size, height: size, borderRadius: "50%",
                        animationDelay: `${i * 0.15}s`,
                      }} />
                    ))}
                  </div>
                </div>
              ) : nodes.length === 0 ? (
                <div className="empty-state" style={{ flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontSize: "16px" }}>No graph data for this session.</div>
                </div>
              ) : (
                <GraphView nodes={nodes} links={links} />
              )}
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <div className="history-list">
              {loadingSession ? (
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {["90%","75%","85%","60%","80%"].map((w, i) => (
                    <div key={i} className="skeleton-box skeleton-pulse" style={{
                      height: 44, width: w,
                      animationDelay: `${i * 0.12}s`,
                    }} />
                  ))}
                </div>
              ) : triples.length === 0 ? (
                <div className="empty-state">
                  No facts captured for this session yet.
                </div>
              ) : (
                <>
                  {[...triples].reverse().map((t, i) => (
                    <div key={i} className="history-item">
                      <div className="history-item-subject">
                        <span className="history-item-type">{t.subjectType}:</span>
                        {" "}{t.subject}{" "}
                        <span className="history-item-relation">—[{t.relation}]→</span>
                        {" "}<span className="history-item-type">{t.objectType}:</span>
                        {" "}{t.object}
                      </div>
                      <div className="history-item-date">
                        {new Date(t.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Chat tab */}
          {activeTab === "chat" && (
            <div style={{ height: "100%", overflow: "hidden" }}>
              {loadingSession ? (
                <div className="empty-state">Loading...</div>
              ) : !chatData ? (
                <div className="empty-state" style={{ flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontSize: "16px" }}>No full chat saved for this session.</div>
                  <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>
                    Use "Save Chat" in the extension to enable RAG mode.
                  </div>
                </div>
              ) : (
                <ChatViewer
                  rawText={chatData.rawText}
                  messageCount={chatData.messageCount}
                  createdAt={chatData.createdAt}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}