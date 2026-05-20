import React, { useState, useEffect, useRef } from "react";
import { searchGlobal } from "../../api/glia";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ chunks: any[], facts: any[] }>({ chunks: [], facts: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        setIsSearching(true);
        try {
          const res = await searchGlobal(searchQuery);
          setSearchResults({
            chunks: res.found ? res.chunks : [],
            facts: res.graphFacts || []
          });
          setShowDropdown(true);
        } catch (err) {
          console.error("Search failed:", err);
          setSearchResults({ chunks: [], facts: [] });
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults({ chunks: [], facts: [] });
        setShowDropdown(false);
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

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
        <div ref={searchRef} style={{ position: "relative", marginRight: "16px" }}>
          <input
            type="text"
            placeholder="Search all projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchQuery.length > 2) setShowDropdown(true); }}
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border-dim)",
              borderRadius: "6px",
              padding: "6px 12px",
              color: "var(--text-primary)",
              width: "250px",
              fontSize: "13px",
              outline: "none"
            }}
          />
          {showDropdown && (
            <div style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              width: "350px",
              maxHeight: "400px",
              overflowY: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              zIndex: 1000,
              padding: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              {isSearching ? (
                <div style={{ padding: "8px", color: "var(--text-secondary)", fontSize: "12px", textAlign: "center" }}>Searching...</div>
              ) : (searchResults.chunks.length > 0 || searchResults.facts.length > 0) ? (
                <>
                  {searchResults.facts.length > 0 && (
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--primary)", padding: "4px 8px", textTransform: "uppercase" }}>Facts</div>
                      {searchResults.facts.map((fact, i) => (
                        <div key={`fact-${i}`} style={{ padding: "8px", background: "var(--surface-elevated)", borderRadius: "4px", fontSize: "12px", borderLeft: "2px solid var(--secondary)", marginBottom: "4px" }}>
                          <span style={{ color: "var(--secondary)", fontWeight: "600" }}>{fact.subject}</span>{" "}
                          <span style={{ color: "var(--text-secondary)" }}>{fact.relation}</span>{" "}
                          <span style={{ color: "var(--secondary)", fontWeight: "600" }}>{fact.object}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.chunks.length > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--primary)", padding: "4px 8px", textTransform: "uppercase" }}>Context</div>
                      {searchResults.chunks.map((result, i) => (
                        <div key={`chunk-${i}`} style={{ padding: "8px", background: "var(--surface-elevated)", borderRadius: "4px", fontSize: "12px", borderLeft: "2px solid var(--primary)", marginBottom: "4px" }}>
                          <div style={{ color: "var(--primary)", fontWeight: "600", marginBottom: "4px", fontSize: "10px", textTransform: "uppercase" }}>
                            {result.projectName || "Unknown Project"}
                          </div>
                          <div style={{ color: "var(--text-primary)", lineHeight: "1.4" }}>
                            {result.content.length > 150 ? result.content.slice(0, 150) + "..." : result.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: "8px", color: "var(--text-secondary)", fontSize: "12px", textAlign: "center" }}>No results found.</div>
              )}
            </div>
          )}
        </div>
        
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
