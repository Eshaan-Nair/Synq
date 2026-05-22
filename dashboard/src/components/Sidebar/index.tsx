import React from "react";
import SidebarHeader from "./SidebarHeader";
import ProjectList from "./ProjectList";
import Legend from "./Legend";
import { SystemHealth } from "../SystemHealth";
import type { Session } from "../../types";

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | undefined;
  deletingId: string | null;
  sessionSearch: string;
  setSessionSearch: (search: string) => void;
  sidebarTab: "projects" | "legend";
  setSidebarTab: (tab: "projects" | "legend") => void;
  onSessionSelect: (session: Session) => void;
  onDeleteSession: (e: React.MouseEvent, sessionId: string) => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  nodeTypes: string[];
  graphTypeFilter: string | null;
  onFilterToggle: (type: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  deletingId,
  sessionSearch,
  setSessionSearch,
  sidebarTab,
  setSidebarTab,
  onSessionSelect,
  onDeleteSession,
  onImport,
  nodeTypes,
  graphTypeFilter,
  onFilterToggle,
}) => {
  return (
    <aside className="sidebar">
      <SidebarHeader />
      
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
          Node Types
        </button>
      </div>

      <div className="sidebar-content">
        {sidebarTab === "projects" ? (
          <ProjectList
            sessions={sessions}
            activeSessionId={activeSessionId}
            deletingId={deletingId}
            sessionSearch={sessionSearch}
            setSessionSearch={setSessionSearch}
            onSessionSelect={onSessionSelect}
            onDeleteSession={onDeleteSession}
            onImport={onImport}
          />
        ) : (
          <Legend
            types={nodeTypes}
            graphTypeFilter={graphTypeFilter}
            onFilterToggle={onFilterToggle}
          />
        )}
      </div>

      <div className="sidebar-footer">
        <SystemHealth />
      </div>
    </aside>
  );
};

export default Sidebar;
