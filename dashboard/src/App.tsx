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
  const [activeTab, setActiveTab] = useState<"history" | "chat" | null>("history");
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadedToExtension, setLoadedToExtension] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosed, setIsClosed] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
      setSelectedNodeId(null);
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

  const loadIntoExtension = useCallback(async () => {
    if (!activeSession) return;
    try {
      await setActiveSessionOnBackend(activeSession._id);
      setLoadedToExtension(true);
      setTimeout(() => setLoadedToExtension(false), 3000);
    } catch (err) {
      setError(`Failed to sync with extension: ${extractErrorMessage(err)}`);
    }
  }, [activeSession]);

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
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Full Screen Background Graph */}
      <div className="background-graph">
        {loadingSession ? (
          <div className="graph-loading">
            {[80, 120, 60, 100, 90, 70].map((size, i) => (
              <div key={i} className="skeleton-box skeleton-pulse" style={{
                width: size, height: size, borderRadius: "50%",
                animationDelay: `${i * 0.15}s`,
              }} />
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <div className="empty-state" style={{ height: "100%", justifyContent: "center" }}>
            No graph data for this session.
          </div>
        ) : (
          <GraphView
            nodes={nodes}
            links={links}
            onNodeClick={(id) => setSelectedNodeId(prev => prev === id ? null : id)}
            selectedNodeId={selectedNodeId}
          />
        )}
      </div>

      {/* Floating UI Layer */}
      <div className="floating-ui-layer">
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <div className="sidebar floating-panel">
          <div className="sidebar-header">
            <div className="sidebar-title">SYNQ</div>
            <div className="sidebar-subtitle">Context Sovereignty Engine</div>
          </div>
          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, marginBottom: "12px" }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                <span>No sessions found.<br/>Capture context using the extension to get started.</span>
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
                      const btn = e.currentTarget.querySelector(".delete-btn") as HTMLElement;
                      if (btn) btn.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget.querySelector(".delete-btn") as HTMLElement;
                      if (btn) btn.style.opacity = "0";
                    }}
                  >
                    <div className="session-header">
                      <div className="session-name">{s.projectName}</div>
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
                        <span><strong>{s.tripleCount}</strong> facts</span>
                        {s.topicCount ? <span><strong>{s.topicCount}</strong> topics</span> : null}
                      </div>
                      <span className="session-date">{new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Top Header ──────────────────────────────────────────── */}
        <div className="top-header floating-panel">
          <div className="header-left">
            {activeSession ? (
              <>
                <span className="header-project-name">{activeSession.projectName}</span>
                <span className="header-meta">
                  {activeSession.tripleCount} facts
                  {activeSession.topicCount ? ` · ${activeSession.topicCount} topics` : ""}
                  {" · "}{activeSession.platform}
                </span>
              </>
            ) : (
              <span style={{ color: "var(--text-dim)", fontSize: "16px" }}>No session selected</span>
            )}
          </div>

          <div className="header-right">

            <div className="header-stats">
              {selectedNodeId && (
                <button className="clear-filter-btn" onClick={() => setSelectedNodeId(null)}>
                  Viewing <strong>{selectedNodeId}</strong> ✕
                </button>
              )}
              <span>Nodes: <strong>{nodes.length}</strong></span>
              <span>Edges: <strong>{links.length}</strong></span>
              <span>Facts: <strong>{triples.length}</strong></span>
            </div>
          </div>
        </div>

        {/* ── Unified Action Bar (Floating Pill) ─────────────────────────── */}
        <div className="unified-action-bar floating-panel">
          <button
            className={`load-ext-btn ${loadedToExtension ? "success" : ""}`}
            onClick={loadIntoExtension}
          >
            {loadedToExtension ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Synced
              </span>
            ) : "Load Extension"}
          </button>


          <div className="tab-divider" />

          {(["history", "chat"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setIsClosed(false);
              }}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            >
              {tab === "history" ? "Facts" : "Chat"}
            </button>
          ))}
        </div>

        {/* ── Right Side Panel (Facts / Chat) ───────────────────── */}
        {activeTab !== null && (
          <div className={`floating-side-content floating-panel ${isExpanded ? "expanded" : ""} ${isClosed ? "closed" : ""}`}>
            {/* Dual-Arrow Handle attached to the left edge */}
            <div className="expand-handle-group">
              {/* Expand Button (Move Left) */}
              <button
                className="handle-btn"
                onClick={() => {
                  if (isClosed) setIsClosed(false);
                  else setIsExpanded(true);
                }}
                disabled={isExpanded}
                title="Expand"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>

              {/* Collapse Button (Move Right) */}
              <button
                className="handle-btn"
                onClick={() => {
                  if (isExpanded) setIsExpanded(false);
                  else setIsClosed(true);
                }}
                disabled={isClosed}
                title="Collapse"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "inherit" }}>
              {/* History tab */}
              {activeTab === "history" && (
                <div className="history-list">
                  {loadingSession ? (
                    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {["90%", "75%", "85%", "60%", "80%"].map((w, i) => (
                        <div key={i} className="skeleton-box skeleton-pulse" style={{ height: 64, width: w, borderRadius: "12px", animationDelay: `${i * 0.12}s` }} />
                      ))}
                    </div>
                  ) : triples.length === 0 ? (
                    <div className="empty-state" style={{ height: "100%", flexDirection: "column" }}>
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.1, marginBottom: "16px" }}>
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      </svg>
                      No facts captured for this session.
                    </div>
                  ) : (

                    <>
                      {[...triples]
                        .reverse()
                        .filter(t => !selectedNodeId || t.subject === selectedNodeId || t.object === selectedNodeId)
                        .map((t, i) => (
                          <div key={i} className="history-item">
                            <div className="history-item-subject">
                              <span className="history-item-type">{t.subjectType}:</span> {t.subject}{" "}
                              <span className="history-item-relation">—[{t.relation}]→</span>{" "}
                              <span className="history-item-type">{t.objectType}:</span> {t.object}
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
                    <div className="empty-state" style={{ flexDirection: "column", gap: "14px", height: "100%", justifyContent: "center" }}>
                      <div style={{ fontSize: "16px" }}>No full chat saved for this session.</div>
                      <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Use "Save Chat" in the extension to enable RAG mode.</div>
                    </div>
                  ) : (
                    <ChatViewer
                      rawText={chatData.rawText}
                      messageCount={chatData.messageCount}
                      createdAt={chatData.createdAt}
                      platform={activeSession?.platform}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}