import React, { useState, useEffect, useCallback, useMemo } from "react";
import GraphView from "./components/GraphView";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import FloatingPanel from "./components/Panels/FloatingPanel";
import MainLayout from "./components/Layout/MainLayout";

import { apiClient, extractErrorMessage } from "./api/glia";
import type { Session } from "./types";
import { useSessions } from "./hooks/useSessions";
import { useGraphData } from "./hooks/useGraphData";
import { PAGE_SIZE } from "./constants";

const App: React.FC = () => {
  // Navigation & UI State
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"history" | "chat" | null>("history");
  const [loadedToExtension, setLoadedToExtension] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphTypeFilter, setGraphTypeFilter] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"projects" | "legend">("projects");
  const [factsPage, setFactsPage] = useState(0);

  // Hooks
  const {
    sessions,
    filteredSessions,
    error: sessionError,
    setError: setSessionError,
    deletingId,
    jobStatus,
    setJobStatus,
    sessionSearch,
    setSessionSearch,
    loadSessions,
    handleDeleteSession,
    handleClearJobs,
  } = useSessions((deletedId) => {
    if (activeSession?._id === deletedId) {
      setActiveSession(null);
      resetData();
    }
  });

  const {
    nodes,
    links,
    triples,
    chatData,
    loadingSession,
    isLoadingSession,
    loadSessionData,
    resetData,
  } = useGraphData();

  // Combine errors
  const currentError = error || sessionError;

  const handleLoadSession = useCallback(async (session: Session) => {
    const isNewSession = activeSession?._id !== session._id;
    setActiveSession(session);
    
    await loadSessionData(session, activeSession?._id);

    if (isNewSession) {
      setSelectedNodeId(null);
      setGraphTypeFilter(null);
      setFactsPage(0);
      setJobStatus({ pending: 0, processing: 0, deadLettered: 0 });
    }
  }, [activeSession, loadSessionData]);

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

  // Initial load and sync
  useEffect(() => {
    if (isLoadingSession) return;
    if (activeSession) {
      const stillExists = sessions.find(s => s._id === activeSession._id);
      if (!stillExists && sessions.length > 0) handleLoadSession(sessions[0]);
    } else if (sessions.length > 0) {
      handleLoadSession(sessions[0]);
    }
  }, [sessions.length, handleLoadSession, activeSession?._id, isLoadingSession]);

  // Polling for processing graph
  useEffect(() => {
    let timer: any;
    if (activeSession) {
      const poll = async () => {
        try {
          const { data: status } = await apiClient.get(`/api/jobs/status/${activeSession._id}`);
          setJobStatus(status);
          
          // If it just finished, refresh the session list to get the final tripleCount
          if (activeSession.isProcessingGraph && status.pending === 0 && status.processing === 0) {
            loadSessions();
            handleLoadSession(activeSession);
          }
        } catch (err) { 
          // Silently fail polling
        }
      };
      poll();
      timer = setInterval(poll, 3000);
    }
    return () => clearInterval(timer);
  }, [activeSession, loadSessions, handleLoadSession, setJobStatus]);

  const pagedTriples = useMemo(() => {
    let list = triples;
    if (selectedNodeId) {
      list = list.filter(t => t.subject === selectedNodeId || t.object === selectedNodeId);
    }
    const start = factsPage * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [triples, selectedNodeId, factsPage]);

  const totalPages = Math.ceil((selectedNodeId ? triples.filter(t => t.subject === selectedNodeId || t.object === selectedNodeId).length : triples.length) / PAGE_SIZE);

  const nodeTypes = useMemo(() => [...new Set(nodes.map(n => n.type))], [nodes]);

  return (
    <MainLayout>
      <Sidebar
        sessions={filteredSessions}
        activeSessionId={activeSession?._id}
        deletingId={deletingId}
        sessionSearch={sessionSearch}
        setSessionSearch={setSessionSearch}
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        onSessionSelect={handleLoadSession}
        onDeleteSession={handleDeleteSession}
        onImport={handleImport}
        nodeTypes={nodeTypes}
        graphTypeFilter={graphTypeFilter}
        onFilterToggle={(type) => setGraphTypeFilter(graphTypeFilter === type ? null : type)}
      />

      <Header
        activeSession={activeSession}
        nodeCount={nodes.length}
        linkCount={links.length}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        graphTypeFilter={graphTypeFilter}
        setGraphTypeFilter={setGraphTypeFilter}
        loadedToExtension={loadedToExtension}
        loadIntoExtension={loadIntoExtension}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setIsClosed={setIsClosed}
      />

      <main className="background-graph">
        <GraphView
          nodes={nodes}
          links={links}
          onNodeClick={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
          filterType={graphTypeFilter}
        />
        {(activeSession?.isProcessingGraph || jobStatus.pending > 0 || jobStatus.processing > 0) && (
          <div className="job-status-bar centered-progress">
            <div className="status-header">
              <div className="processing-dot" />
              <span className="status-title">
                {jobStatus.processing > 0 ? "Extracting Memories..." : "Queued in Brain..."}
              </span>
            </div>
            <div className="status-meta">
              {(Number(jobStatus?.pending) || 0) + (Number(jobStatus?.processing) || 0)} chunks remaining
            </div>
            {jobStatus.deadLettered > 0 && (
              <div className="status-error">
                <span> {jobStatus.deadLettered} facts failed</span>
                <button onClick={handleClearJobs} className="clear-btn">Clear</button>
              </div>
            )}
          </div>
        )}

      </main>

      <FloatingPanel
        isClosed={isClosed}
        setIsClosed={setIsClosed}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
        activeTab={activeTab}
        loadingSession={loadingSession}
        pagedTriples={pagedTriples}
        factsPage={factsPage}
        setFactsPage={setFactsPage}
        totalPages={totalPages}
        chatData={chatData}
        activeSession={activeSession}
      />

      {currentError && (
        <div className="error-banner">
          <span>{currentError}</span>
          <button onClick={() => { setError(null); setSessionError(null); }} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px" }}>×</button>
        </div>
      )}
    </MainLayout>
  );
};

export default App;
