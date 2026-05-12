import { useEffect, useState, useCallback, useRef } from "react";
import GraphView from "./components/GraphView";
import ChatViewer from "./components/ChatViewer";
import { fetchContext, fetchSessions, setActiveSession as setActiveSessionOnBackend, deleteSession, exportSession, importSession, extractErrorMessage, apiClient } from "./api/glia";
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
  isProcessingGraph?: boolean;
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
  const [graphTypeFilter, setGraphTypeFilter] = useState<string | null>(null); // visual only, not sent to backend
  const [sidebarTab, setSidebarTab] = useState<"projects" | "legend">("projects");
  const [sessionSearch, setSessionSearch] = useState("");
  const [factsPage, setFactsPage] = useState(0);
  const [jobStatus, setJobStatus] = useState({ pending: 0, processing: 0, deadLettered: 0 });
  const PAGE_SIZE = 50;

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
    // If selecting a NEW session, show loading. If just refreshing current, stay silent.
    const isNewSession = activeSession?._id !== session._id;
    
    if (isNewSession) {
      setLoadingSession(true);
      setChatData(null);
    }
    
    setActiveSession(session);
    isLoadingSessionRef.current = true;
    try {
      const graphUrl = `/api/graph/session/${session._id}`;
      const [graphRes, contextData, chatResult] = await Promise.all([
        apiClient.get(graphUrl),
        fetchContext(session._id),
        fetchFullChat(session._id),
      ]);
      const graphData = graphRes.data;
      
      // STABILITY FIX: Only update nodes/links if data has actually changed
      // This prevents the D3 simulation from restarting every time we poll.
      setNodes(prev => {
        if (prev.length === graphData.nodes.length && !isNewSession) return prev;
        return graphData.nodes;
      });
      
      setLinks(prev => {
        if (prev.length === graphData.links.length && !isNewSession) return prev;
        return graphData.links;
      });

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
      if (isNewSession) {
        setSelectedNodeId(null);
        setGraphTypeFilter(null);
      }
      setLoadingSession(false);
      isLoadingSessionRef.current = false;
    }
  }, [activeSession, nodes.length, links.length]);

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
      if (!stillExists) {
        loadSession(sessions[0]);
      }
    } else {
      loadSession(sessions[0]);
    }
  }, [sessions.length, loadSession, activeSession?._id]); // Only run if count or active ID changes

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (activeSession?.isProcessingGraph) {
      const poll = async () => {
        try {
          const res = await apiClient.get("/api/jobs/status");
          if (res.status === 200) {
            const status = res.data;
            setJobStatus(status);
            if (status.pending === 0 && status.processing === 0) {
              loadSessions(); // refresh to see if done
              if (activeSession) loadSession(activeSession);
            }
          }
        } catch { }
      };
      poll();
      timer = setInterval(poll, 3000);
    }
    return () => clearInterval(timer);
  }, [activeSession?.isProcessingGraph, loadSessions, loadSession, activeSession]);
  // Type filter is now handled strictly visually in GraphView, 
  // so we no longer reload from the backend when graphTypeFilter changes.

  const handleClearJobs = async () => {
    try {
      await apiClient.post("/api/jobs/clear");
      setJobStatus({ pending: 0, processing: 0, deadLettered: 0 });
      loadSessions();
    } catch { }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const res = await importSession(json);
        if (res.success) {
          setError(null);
          loadSessions();
        }
      } catch (err) {
        setError(`Import failed: ${extractErrorMessage(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const filteredSessions = sessions.filter(s =>
    s.projectName.toLowerCase().includes(sessionSearch.toLowerCase()) ||
    s.platform.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  const filteredTriples = triples
    .filter(t => !selectedNodeId || t.subject === selectedNodeId || t.object === selectedNodeId);

  const pagedTriples = filteredTriples.slice(factsPage * PAGE_SIZE, (factsPage + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredTriples.length / PAGE_SIZE);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => {
      if (!document.hidden) loadSessions();
    }, 5000); // v1.4.7+: Poll every 5s for job status
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
          <div className="empty-state" style={{ height: "100%", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
            {activeSession?.isProcessingGraph ? (
              <>
                <div className="processing-indicator large" style={{ background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.2)" }}>
                  <span className="processing-dot"></span>
                  Extracting semantic triples...
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: "14px", maxWidth: "300px", textAlign: "center", lineHeight: "1.5" }}>
                  This may take a few minutes for large chats. The graph will populate automatically.
                </div>
              </>
            ) : (
              "No graph data for this session."
            )}
          </div>
        ) : (
          <GraphView
            nodes={nodes}
            links={links}
            onNodeClick={(id) => setSelectedNodeId(prev => prev === id ? null : id)}
            selectedNodeId={selectedNodeId}
            filterType={graphTypeFilter}
          />
        )}
      </div>

      {/* Floating UI Layer */}
      <div className="floating-ui-layer">
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <div className="sidebar floating-panel">
          <div className="sidebar-header">
            <div className="sidebar-title">Glia</div>
            <div className="sidebar-subtitle">AI Memory Layer</div>
          </div>
          <div className="sidebar-tabs-container">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${sidebarTab === "projects" ? "active" : ""}`}
                onClick={() => setSidebarTab("projects")}
              >
                Projects
              </button>
              <button
                className={`sidebar-tab ${sidebarTab === "legend" ? "active" : ""}`}
                onClick={() => setSidebarTab("legend")}
              >
                Legend
              </button>
            </div>
          </div>

          <div className="sidebar-content">
            {sidebarTab === "projects" ? (
              <div className="session-list">
                {sessions.length === 0 ? (
                  <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, marginBottom: "12px" }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="3" y1="9" x2="21" y2="9"></line>
                      <line x1="9" y1="21" x2="9" y2="9"></line>
                    </svg>
                    <span>No sessions found.<br />Capture context using the extension to get started.</span>
                  </div>
                ) : (
                  <>
                    <div className="session-list-header">
                      <input
                        className="search-input"
                        placeholder="Search projects..."
                        value={sessionSearch}
                        onChange={(e) => setSessionSearch(e.target.value)}
                      />
                      <label className="import-btn-label" title="Import Session">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
                      </label>
                    </div>
                    {filteredSessions.map((s) => {
                      const isActive = activeSession?._id === s._id;
                      return (
                        <div
                          key={s._id}
                          className={`session-item ${isActive ? "active" : ""}`}
                          onClick={() => loadSession(s)}
                        >
                          <div className="session-header">
                            <div className="session-name">{s.projectName}</div>
                            {s.isProcessingGraph && (
                              <span className="processing-indicator" title="Graph extraction in progress...">
                                <span className="processing-dot"></span>
                                Updating...
                              </span>
                            )}
                            <div className="session-actions">
                              <button
                                className="action-btn export-btn"
                                onClick={(e) => { e.stopPropagation(); exportSession(s._id); }}
                                title="Export session"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                              </button>
                              <button
                                className="action-btn delete-btn"
                                onClick={(e) => handleDelete(e, s._id)}
                                title="Delete session"
                              >
                                {deletingId === s._id ? "..." : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>}
                              </button>
                            </div>
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
                    })}
                  </>
                )}
              </div>
            ) : (
              <div className="legend-sidebar-list">
                <div className="sidebar-section-title">Entity Types (Filter)</div>
                {nodes.length === 0 ? (
                  <div className="empty-state">No graph data.</div>
                ) : (
                  <div className="legend-items">
                    {[...new Set(nodes.map(n => n.type))].map(type => (
                      <div
                        key={type}
                        className={`legend-sidebar-item ${graphTypeFilter === type ? "active" : ""}`}
                        onClick={() => setGraphTypeFilter(graphTypeFilter === type ? null : type)}
                      >
                        <div className="legend-dot-wrapper">
                          <div className="legend-dot" style={{ background: (window as any).TYPE_COLORS?.[type] || "#475569" }} />
                        </div>
                        <span className="legend-text">{type}</span>
                        {graphTypeFilter === type && <div className="legend-active-indicator" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Top Header ──────────────────────────────────────────── */}
        <div className="top-header floating-panel">
          <div className="header-left">
            {activeSession ? (
              <>
                <span className="header-project-name">
                  {activeSession.projectName}
                </span>
                <span className="header-meta">
                  {nodes.length} nodes
                  {" · "}{links.length} edges
                  {" · "}{activeSession.platform}
                </span>
              </>
            ) : (
              <span style={{ color: "var(--text-dim)", fontSize: "16px" }}>No session selected</span>
            )}
          </div>

          <div className="header-right">
            {selectedNodeId && (
              <button className="clear-filter-btn" onClick={() => setSelectedNodeId(null)}>
                Viewing <strong>{selectedNodeId}</strong> ✕
              </button>
            )}
            <div className="unified-action-bar">
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

          </div>
        </div>

        {/* ── Job Progress Bar ─────────────────────────── */}
        {/* Job Failures only */}
        {jobStatus.deadLettered > 0 && !activeSession?.isProcessingGraph && (
          <div className="job-status-bar floating-panel" style={{ top: '110px' }}>
            <span style={{ color: "var(--red)" }}>⚠ {jobStatus.deadLettered} jobs failed</span>
            <button className="job-cancel-btn" onClick={handleClearJobs}>Dismiss</button>
          </div>
        )}

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
                <div className="history-tab-container">
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
                        {[...pagedTriples]
                          .reverse()
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
                    {totalPages > 1 && (
                      <div className="pagination">
                        <button
                          disabled={factsPage === 0}
                          onClick={() => setFactsPage(p => p - 1)}
                        >Prev</button>
                        <span>Page {factsPage + 1} of {totalPages}</span>
                        <button
                          disabled={factsPage >= totalPages - 1}
                          onClick={() => setFactsPage(p => p + 1)}
                        >Next</button>
                      </div>
                    )}
                  </div>
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
