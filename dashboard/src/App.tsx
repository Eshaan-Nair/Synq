import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import GraphView from "./components/GraphView";
import ChatViewer from "./components/ChatViewer";
import { fetchSessions, deleteSession, exportSession, fetchContext, apiClient, extractErrorMessage } from "./api/glia";
import { fetchFullChat } from "./api/rag";

export interface Session {
  _id: string;
  projectName: string;
  platform: string;
  tripleCount: number;
  topicCount?: number;
  isProcessingGraph?: boolean;
  updatedAt: string;
}

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
  timestamp: string;
}

const App: React.FC = () => {
  // Graph & Data State
  const [nodes, setNodes] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  
  // Navigation & UI State
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"history" | "chat" | null>("history");
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadedToExtension, setLoadedToExtension] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chatData, setChatData] = useState<{ rawText: string; messageCount: number; createdAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphTypeFilter, setGraphTypeFilter] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"projects" | "legend">("projects");
  const [sessionSearch, setSessionSearch] = useState("");
  const [factsPage, setFactsPage] = useState(0);
  const [jobStatus, setJobStatus] = useState({ pending: 0, processing: 0, deadLettered: 0 });
  const PAGE_SIZE = 50;

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
      await loadSessions();
    } catch (err) {
      setError(`Delete failed: ${extractErrorMessage(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const loadIntoExtension = async () => {
    if (!activeSession) return;
    try {
      const resp = await apiClient.post("/api/context/active", { sessionId: activeSession._id });
      if (resp.data.success) {
        setLoadedToExtension(true);
        setTimeout(() => setLoadedToExtension(false), 3000);
      }
    } catch (err) {
      setError(`Failed to sync: ${extractErrorMessage(err)}`);
    }
  };

  const handleClearJobs = async () => {
    try {
      await apiClient.post("/api/jobs/clear");
      setJobStatus({ pending: 0, processing: 0, deadLettered: 0 });
    } catch (err) {
      console.error("Failed to clear jobs");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        await apiClient.post("/api/session/import", data);
        await loadSessions();
      } catch (err) {
        setError(`Import failed: ${extractErrorMessage(err)}`);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => {
      if (!document.hidden) loadSessions();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    if (isLoadingSessionRef.current) return;
    if (activeSession) {
      const stillExists = sessions.find(s => s._id === activeSession._id);
      if (!stillExists) loadSession(sessions[0]);
    } else if (sessions.length > 0) {
      loadSession(sessions[0]);
    }
  }, [sessions.length, loadSession, activeSession?._id]);

  useEffect(() => {
    let timer: any;
    if (activeSession?.isProcessingGraph) {
      const poll = async () => {
        try {
          const { data: status } = await apiClient.get(`/api/jobs/status/${activeSession._id}`);
          setJobStatus(status);
          if (status.pending === 0 && status.processing === 0) {
            loadSessions();
            if (activeSession) loadSession(activeSession);
          }
        } catch (err) { console.error("Job poll failed"); }
      };
      poll();
      timer = setInterval(poll, 3000);
    }
    return () => clearInterval(timer);
  }, [activeSession, loadSessions, loadSession]);

  const filteredSessions = sessions.filter(s =>
    s.projectName.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  const pagedTriples = useMemo(() => {
    let list = triples;
    if (selectedNodeId) {
      list = list.filter(t => t.subject === selectedNodeId || t.object === selectedNodeId);
    }
    const start = factsPage * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [triples, selectedNodeId, factsPage]);

  const totalPages = Math.ceil((selectedNodeId ? triples.filter(t => t.subject === selectedNodeId || t.object === selectedNodeId).length : triples.length) / PAGE_SIZE);

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">GLIA</div>
          <div className="sidebar-subtitle">AI MEMORY LAYER</div>
        </div>
        
        <div className="sidebar-tabs">
          <button className={`sidebar-tab ${sidebarTab === "projects" ? "active" : ""}`} onClick={() => setSidebarTab("projects")}>Projects</button>
          <button className={`sidebar-tab ${sidebarTab === "legend" ? "active" : ""}`} onClick={() => setSidebarTab("legend")}>Legend</button>
        </div>

        <div className="sidebar-content">
          {sidebarTab === "projects" ? (
            <div className="session-list">
              <div className="search-container" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input className="search-input" placeholder="Search projects..." value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} style={{ flex: 1 }} />
                <label className="tab-btn" title="Import Session" style={{ padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
                </label>
              </div>
              
              {sessions.length === 0 ? (
                <div className="empty-state" style={{ height: "300px" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, marginBottom: "16px" }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  No sessions found.
                </div>
              ) : (
                filteredSessions.map((s) => {
                  const isActive = activeSession?._id === s._id;
                  return (
                    <div key={s._id} className={`session-item ${isActive ? "active" : ""}`} onClick={() => loadSession(s)}>
                      <div className="session-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div className="session-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, margin: 0 }}>{s.projectName}</div>
                        <div className="session-actions" style={{ display: "flex", gap: "4px" }}>
                           <button className="action-btn" onClick={(e) => { e.stopPropagation(); exportSession(s._id); }}>
                             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                           </button>
                           <button className="action-btn delete-btn" onClick={(e) => handleDelete(e, s._id)}>
                             {deletingId === s._id ? "..." : (
                               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                             )}
                           </button>
                        </div>
                      </div>
                      <div className="session-meta">
                        <span>{s.tripleCount} facts · {s.platform}</span>
                        <span>{new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="legend-sidebar-list">
              <div className="legend-items" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
                {[...new Set(nodes.map(n => n.type))].map(type => (
                  <div key={type} className={`filter-pill ${graphTypeFilter === type ? "active" : ""}`} onClick={() => setGraphTypeFilter(graphTypeFilter === type ? null : type)} style={{ width: "100%" }}>
                    <div className="legend-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: (window as any).TYPE_COLORS?.[type] || "#4F46E5", marginRight: "12px", flexShrink: 0 }} />
                    {type}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Top Header */}
      <header className="top-header">
        <div className="header-left">
          {activeSession ? (
            <>
              <span className="header-project-name">{activeSession.projectName}</span>
              <span className="header-meta" style={{ opacity: 0.5, fontSize: "12px", marginLeft: "12px" }}>
                {nodes.length} nodes · {links.length} edges
              </span>
              {selectedNodeId && (
                <div onClick={() => setSelectedNodeId(null)} style={{ marginLeft: "16px", padding: "4px 10px", background: "var(--primary-glow)", border: "1px solid var(--border-glow)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} title="Clear Selection">
                  <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: "600", pointerEvents: "none" }}>Focus: {selectedNodeId}</span>
                  <button style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "16px", padding: "0 2px", lineHeight: "1", pointerEvents: "none" }}>×</button>
                </div>
              )}
              {graphTypeFilter && (
                <div onClick={() => setGraphTypeFilter(null)} style={{ marginLeft: "8px", padding: "4px 10px", background: "var(--surface-elevated)", border: "1px solid var(--primary)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} title="Clear Filter">
                  <div className="legend-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: (window as any).TYPE_COLORS?.[graphTypeFilter] || "var(--primary)" }} />
                  <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: "600", pointerEvents: "none" }}>Type: {graphTypeFilter}</span>
                  <button style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "16px", padding: "0 2px", lineHeight: "1", pointerEvents: "none" }}>×</button>
                </div>
              )}
            </>
          ) : (
            <span style={{ opacity: 0.3 }}>No session active</span>
          )}
        </div>

        <div className="header-right">
          <div className="unified-action-bar">
            <button className={`tab-btn ${loadedToExtension ? "active" : ""}`} onClick={loadIntoExtension}>
              {loadedToExtension ? "Loaded" : "Load Extension"}
            </button>
            <div style={{ width: "1px", background: "var(--border-dim)", margin: "0 4px" }} />
            <button className={`tab-btn ${activeTab === "history" ? "active" : ""}`} onClick={() => { setActiveTab("history"); setIsClosed(false); }}>Facts</button>
            <button className={`tab-btn ${activeTab === "chat" ? "active" : ""}`} onClick={() => { setActiveTab("chat"); setIsClosed(false); }}>Chat</button>
          </div>
        </div>
      </header>

      {/* Main Graph */}
      <main className="background-graph">
        <GraphView
          nodes={nodes}
          links={links}
          onNodeClick={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
          filterType={graphTypeFilter}
        />
        {activeSession?.isProcessingGraph && (
          <div className="job-status-bar" style={{ position: "absolute", top: "88px", left: "304px", background: "var(--surface)", backdropFilter: "blur(10px)", border: "1px solid var(--primary)", display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", borderRadius: "10px" }}>
            <div className="processing-dot" style={{ width: "8px", height: "8px", background: "var(--primary)", borderRadius: "50%", boxShadow: "0 0 10px var(--primary)" }} />
            <span style={{ fontSize: "12px", fontWeight: "600" }}>
              {jobStatus.processing > 0 ? "Extracting Memories..." : "Queued..."}
            </span>
            {jobStatus.deadLettered > 0 && (
              <span style={{ fontSize: "11px", color: "var(--danger)", marginLeft: "8px" }}>
                ({jobStatus.deadLettered} failed)
                <button onClick={handleClearJobs} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", marginLeft: "4px", cursor: "pointer", fontSize: "14px" }}>×</button>
              </span>
            )}
          </div>
        )}
      </main>

      {/* Right Floating Panel */}
      <aside className={`floating-side-content ${isClosed ? "closed" : ""} ${isExpanded ? "expanded" : ""}`}>
        <div className="expand-handle-group" style={{ left: "-28px", top: "40px", borderRadius: "8px 0 0 8px" }}>
          <button className="handle-btn" onClick={() => {
            if (isClosed) {
              setIsClosed(false);
              setIsExpanded(false);
            } else if (!isExpanded) {
              setIsExpanded(true);
            }
          }} title="Expand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button className="handle-btn" onClick={() => {
            if (isExpanded) {
              setIsExpanded(false);
            } else if (!isClosed) {
              setIsClosed(true);
            }
          }} title="Collapse">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "20px" }}>
          {activeTab === "history" && (
            <div className="history-list">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ fontFamily: "Outfit", fontSize: "18px" }}>Captured Facts</h3>
              </div>

              {loadingSession ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-box" style={{ height: "80px", borderRadius: "12px", opacity: 0.1 }} />)}
                </div>
              ) : pagedTriples.length === 0 ? (
                <div className="empty-state" style={{ height: "100%", justifyContent: "center" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.2, marginBottom: "20px" }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                  No facts captured yet.
                </div>
              ) : (
                <>
                  {pagedTriples.map((t, i) => (
                    <div key={i} className="history-item">
                      <div className="history-item-subject">
                        <span className="history-item-type">{t.subjectType}</span> {t.subject}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                        {t.relation} → <span style={{ color: "var(--secondary)", fontWeight: "600" }}>{t.object}</span> ({t.objectType})
                      </div>
                      <div style={{ fontSize: "9px", opacity: 0.3 }}>{new Date(t.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                  
                  {totalPages > 1 && (
                    <div className="pagination" style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center", alignItems: "center" }}>
                      <button className="tab-btn" disabled={factsPage === 0} onClick={() => setFactsPage(p => p - 1)}>Prev</button>
                      <span style={{ fontSize: "12px", opacity: 0.5 }}>{factsPage + 1} / {totalPages}</span>
                      <button className="tab-btn" disabled={factsPage >= totalPages - 1} onClick={() => setFactsPage(p => p + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "chat" && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              {chatData ? (
                <ChatViewer
                  rawText={chatData.rawText}
                  messageCount={chatData.messageCount}
                  createdAt={chatData.createdAt}
                  platform={activeSession?.platform}
                />
              ) : (
                <div className="empty-state">No chat saved for this project.</div>
              )}
            </div>
          )}
        </div>
      </aside>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px" }}>×</button>
        </div>
      )}
    </div>
  );
};

export default App;
