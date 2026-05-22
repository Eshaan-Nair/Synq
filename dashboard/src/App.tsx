import React, { useState, useEffect, useCallback, useMemo } from "react";
import GraphView from "./components/GraphView";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import MainLayout from "./components/Layout/MainLayout";
import { GlobalSearchView } from "./components/GlobalSearchView";
import FloatingPanel from "./components/Panels/FloatingPanel";

import { apiClient, extractErrorMessage } from "./api/glia";
import type { Session } from "./types";
import { useSessions } from "./hooks/useSessions";
import { useGraphData } from "./hooks/useGraphData";
import { PAGE_SIZE } from "./constants";

const App: React.FC = () => {
  // Navigation & UI State
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"graph" | "search">("graph");
  const [activeSideTab, setActiveSideTab] = useState<"history" | "chat" | null>("history");
  const [loadedToExtension, setLoadedToExtension] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosed, setIsClosed] = useState(true);

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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphTypeFilter, setGraphTypeFilter] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"projects" | "legend">("projects");
  const [factsPage, setFactsPage] = useState(0);
  const [factSearch, setFactSearch] = useState("");
  const [minDegree, setMinDegree] = useState(0);

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
      setFactSearch("");
      setJobStatus({ pending: 0, processing: 0, deadLettered: 0 });
    }
  }, [activeSession, loadSessionData]);

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
            const freshSessions = await loadSessions();
            const updatedSession = freshSessions?.find((s: any) => s._id === activeSession._id);
            if (updatedSession) {
              handleLoadSession(updatedSession);
            } else {
              handleLoadSession({ ...activeSession, isProcessingGraph: false });
            }
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

  const degreeMap = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach(node => map.set(node.id, 0));
    links.forEach(link => {
      const s = typeof link.source === "string" ? link.source : (link.source as any).id;
      const t = typeof link.target === "string" ? link.target : (link.target as any).id;
      map.set(s, (map.get(s) || 0) + 1);
      map.set(t, (map.get(t) || 0) + 1);
    });
    return map;
  }, [nodes, links]);

  const pagedTriples = useMemo(() => {
    let list = triples;
    if (minDegree > 0) {
      list = list.filter(t => {
        const sDegree = degreeMap.get(t.subject) || 0;
        const oDegree = degreeMap.get(t.object) || 0;
        return sDegree >= minDegree && oDegree >= minDegree;
      });
    }
    if (selectedNodeId) {
      list = list.filter(t => t.subject === selectedNodeId || t.object === selectedNodeId);
    }
    if (factSearch) {
      const q = factSearch.toLowerCase();
      list = list.filter(t => 
        t.subject.toLowerCase().includes(q) || 
        t.object.toLowerCase().includes(q) || 
        t.relation.toLowerCase().includes(q)
      );
    }
    const start = factsPage * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [triples, selectedNodeId, factsPage, factSearch, minDegree, degreeMap]);

  const filteredTripleCount = useMemo(() => {
    let list = triples;
    if (minDegree > 0) {
      list = list.filter(t => {
        const sDegree = degreeMap.get(t.subject) || 0;
        const oDegree = degreeMap.get(t.object) || 0;
        return sDegree >= minDegree && oDegree >= minDegree;
      });
    }
    if (selectedNodeId) {
      list = list.filter(t => t.subject === selectedNodeId || t.object === selectedNodeId);
    }
    if (factSearch) {
      const q = factSearch.toLowerCase();
      list = list.filter(t => 
        t.subject.toLowerCase().includes(q) || 
        t.object.toLowerCase().includes(q) || 
        t.relation.toLowerCase().includes(q)
      );
    }
    return list.length;
  }, [triples, selectedNodeId, factSearch, minDegree, degreeMap]);

  const totalPages = Math.ceil(filteredTripleCount / PAGE_SIZE);

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
        activeMainTab={activeMainTab as any}
        setActiveMainTab={setActiveMainTab as any}
        activeSideTab={activeSideTab}
        setActiveSideTab={setActiveSideTab}
        isClosed={isClosed}
        setIsClosed={setIsClosed}
        loadedToExtension={loadedToExtension}
        loadIntoExtension={loadIntoExtension}
        filterType={graphTypeFilter}
        setFilterType={setGraphTypeFilter}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
      />

      <main className="background-graph" style={{ zIndex: 1 }}>
        <div style={{ position: "absolute", inset: 0, opacity: activeMainTab === "search" ? 0 : 1, pointerEvents: activeMainTab === "search" ? "none" : "auto", transition: "opacity 0.2s" }}>
          <GraphView
            nodes={nodes}
            links={links}
            onNodeClick={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
            filterType={graphTypeFilter}
            minDegree={minDegree}
            setMinDegree={setMinDegree}
            activeSessionId={activeSession?._id}
          />
        </div>
        
        {activeMainTab === "graph" && (
          <FloatingPanel
            isClosed={isClosed}
            setIsClosed={setIsClosed}
            isExpanded={isExpanded}
            setIsExpanded={setIsExpanded}
            activeTab={activeSideTab || "history"}
            loadingSession={loadingSession}
            pagedTriples={pagedTriples}
            factsPage={factsPage}
            setFactsPage={setFactsPage}
            factSearch={factSearch}
            setFactSearch={setFactSearch}
            totalPages={totalPages}
            chatData={chatData}
            activeSession={activeSession}
          />
        )}

        {activeMainTab === "search" && (
          <div style={{ position: "absolute", top: 0, left: 240, right: 0, bottom: 0, zIndex: 10, background: "var(--bg-deep)", overflowY: "auto" }}>
            <GlobalSearchView />
          </div>
        )}
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
