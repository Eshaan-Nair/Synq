import React from "react";
import type { Session } from "../../types";
import { TYPE_COLORS } from "../../constants";

interface HeaderProps {
  activeSession: Session | null;
  nodeCount: number;
  linkCount: number;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  graphTypeFilter: string | null;
  setGraphTypeFilter: (filter: string | null) => void;
  loadedToExtension: boolean;
  loadIntoExtension: () => void;
  activeTab: "history" | "chat" | null;
  setActiveTab: (tab: "history" | "chat" | null) => void;
  setIsClosed: (closed: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({
  activeSession,
  nodeCount,
  linkCount,
  selectedNodeId,
  setSelectedNodeId,
  graphTypeFilter,
  setGraphTypeFilter,
  loadedToExtension,
  loadIntoExtension,
  activeTab,
  setActiveTab,
  setIsClosed,
}) => {
  return (
    <header className="top-header">
      <div className="header-left">
        {activeSession ? (
          <>
            <span className="header-project-name">{activeSession.projectName}</span>
            <span className="header-meta" style={{ opacity: 0.5, fontSize: "12px", marginLeft: "12px" }}>
              {nodeCount} nodes · {linkCount} edges
            </span>
            {selectedNodeId && (
              <div
                onClick={() => setSelectedNodeId(null)}
                style={{
                  marginLeft: "16px",
                  padding: "4px 10px",
                  background: "var(--primary-glow)",
                  border: "1px solid var(--border-glow)",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer"
                }}
                title="Clear Selection"
              >
                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: "600", pointerEvents: "none" }}>
                  Focus: {selectedNodeId}
                </span>
                <button
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "16px",
                    padding: "0 2px",
                    lineHeight: "1",
                    pointerEvents: "none"
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {graphTypeFilter && (
              <div
                onClick={() => setGraphTypeFilter(null)}
                style={{
                  marginLeft: "8px",
                  padding: "4px 10px",
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--primary)",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer"
                }}
                title="Clear Filter"
              >
                <div
                  className="legend-dot"
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: TYPE_COLORS[graphTypeFilter]
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: "600", pointerEvents: "none" }}>
                  Type: {graphTypeFilter}
                </span>
                <button
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "16px",
                    padding: "0 2px",
                    lineHeight: "1",
                    pointerEvents: "none"
                  }}
                >
                  ×
                </button>
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
          <button
            className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => { setActiveTab("history"); setIsClosed(false); }}
          >
            Facts
          </button>
          <button
            className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => { setActiveTab("chat"); setIsClosed(false); }}
          >
            Chat
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
