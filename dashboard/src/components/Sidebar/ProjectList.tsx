import React from "react";
import type { Session } from "../../types";
import { exportSession } from "../../api/glia";

interface ProjectListProps {
  sessions: Session[];
  activeSessionId: string | undefined;
  deletingId: string | null;
  sessionSearch: string;
  setSessionSearch: (search: string) => void;
  onSessionSelect: (session: Session) => void;
  onDeleteSession: (e: React.MouseEvent, sessionId: string) => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({
  sessions,
  activeSessionId,
  deletingId,
  sessionSearch,
  setSessionSearch,
  onSessionSelect,
  onDeleteSession,
  onImport,
}) => {
  return (
    <div className="session-list">
      <div className="search-container" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          className="search-input"
          placeholder="Search projects..."
          value={sessionSearch}
          onChange={(e) => setSessionSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <label
          className="tab-btn"
          title="Import Session"
          style={{ padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <input type="file" accept=".json" onChange={onImport} style={{ display: "none" }} />
        </label>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state" style={{ height: "300px" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, marginBottom: "16px" }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          No sessions found.
        </div>
      ) : (
        sessions.map((session) => {
          const isActive = activeSessionId === session._id;
          return (
            <div key={session._id} className={`session-item ${isActive ? "active" : ""}`} onClick={() => onSessionSelect(session)}>
              <div className="session-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <div className="session-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, margin: 0 }}>
                  {session.projectName}
                </div>
                <div className="session-actions" style={{ display: "flex", gap: "4px" }}>
                  <button className="action-btn" onClick={(e) => { e.stopPropagation(); exportSession(session._id); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </button>
                  <button className="action-btn delete-btn" onClick={(e) => onDeleteSession(e, session._id)}>
                    {deletingId === session._id ? "..." : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="session-meta">
                <span>{session.tripleCount} facts · {session.platform}</span>
                <span>{new Date(session.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default ProjectList;
