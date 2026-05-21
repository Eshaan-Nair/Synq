import React from "react";

interface HeaderProps {
  activeMainTab: "graph" | "search";
  setActiveMainTab: (tab: "graph" | "search") => void;
  activeSideTab: "history" | "chat" | null;
  setActiveSideTab: (tab: "history" | "chat" | null) => void;
  isClosed: boolean;
  setIsClosed: (closed: boolean) => void;
  loadedToExtension: boolean;
  loadIntoExtension: () => void;
}

const Header: React.FC<HeaderProps> = ({ activeMainTab, setActiveMainTab, activeSideTab, setActiveSideTab, isClosed, setIsClosed, loadedToExtension, loadIntoExtension }) => {
  return (
    <>
      {/* Center Tabs */}
      <div style={{ position: "absolute", top: "16px", left: "calc(50% + 120px)", transform: "translateX(-50%)", zIndex: 100 }}>
        <div className="unified-action-bar" style={{ display: "flex", gap: "8px", padding: "6px", background: "var(--surface)", border: "1px solid var(--border-main)", borderRadius: "12px", backdropFilter: "var(--surface-blur)" }}>
          <button
            className={`tab-btn ${activeMainTab === "graph" ? "active" : ""}`}
            onClick={() => setActiveMainTab("graph")}
          >
            Knowledge Graph
          </button>
          <button
            className={`tab-btn ${activeMainTab === "search" ? "active" : ""}`}
            onClick={() => setActiveMainTab("search")}
          >
            Global Search
          </button>
        </div>
      </div>

      {/* Right Tabs */}
      <div style={{ position: "absolute", top: "16px", right: "24px", zIndex: 100 }}>
        <div className="unified-action-bar" style={{ display: "flex", gap: "8px", padding: "6px", background: "var(--surface)", border: "1px solid var(--border-main)", borderRadius: "12px", backdropFilter: "var(--surface-blur)", alignItems: "center" }}>
          <button className={`tab-btn ${loadedToExtension ? "active" : ""}`} onClick={loadIntoExtension}>
            {loadedToExtension ? "Loaded" : "Load Extension"}
          </button>
          <div style={{ width: "1px", height: "16px", background: "var(--border-dim)", margin: "0 4px" }} />
          <button className={`tab-btn ${!isClosed && activeSideTab === "history" ? "active" : ""}`} onClick={() => { setActiveSideTab("history"); setIsClosed(false); }}>
            Facts
          </button>
          <button className={`tab-btn ${!isClosed && activeSideTab === "chat" ? "active" : ""}`} onClick={() => { setActiveSideTab("chat"); setIsClosed(false); }}>
            Chat
          </button>
        </div>
      </div>
    </>
  );
};

export default Header;

