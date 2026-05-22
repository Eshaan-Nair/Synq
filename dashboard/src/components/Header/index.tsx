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

const Header: React.FC<HeaderProps> = ({ 
  activeMainTab, setActiveMainTab, activeSideTab, setActiveSideTab, 
  isClosed, setIsClosed, loadedToExtension, loadIntoExtension
}) => {
  return (
    <div style={{ position: "absolute", top: "16px", left: "264px", right: "24px", zIndex: 100, display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "var(--surface)", border: "1px solid var(--border-main)", borderRadius: "12px", backdropFilter: "var(--surface-blur)", alignItems: "center" }}>
      {/* Left Tabs */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", alignItems: "center", gap: "12px" }}>
        <button className={`tab-btn ${loadedToExtension ? "active" : ""}`} onClick={loadIntoExtension}>
          {loadedToExtension ? "Loaded" : "Load Session"}
        </button>
      </div>

      {/* Center Tabs */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
        <button
          className={`tab-btn ${activeMainTab === "graph" ? "active" : ""}`}
          onClick={() => setActiveMainTab("graph")}
        >
          Knowledge Graph
        </button>
        <button 
          className={`tab-btn ${!isClosed && activeSideTab === "history" ? "active" : ""}`} 
          onClick={() => { setActiveSideTab("history"); setIsClosed(false); }}
        >
          Facts
        </button>
        <button 
          className={`tab-btn ${!isClosed && activeSideTab === "chat" ? "active" : ""}`} 
          onClick={() => { setActiveSideTab("chat"); setIsClosed(false); }}
        >
          Chat
        </button>
        <button
          className={`tab-btn ${activeMainTab === "search" ? "active" : ""}`}
          onClick={() => setActiveMainTab("search")}
        >
          Global Search
        </button>
      </div>

      {/* Right Spacer */}
      <div style={{ flex: 1 }}></div>
    </div>
  );
};

export default Header;

