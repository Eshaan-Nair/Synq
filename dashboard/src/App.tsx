import { useEffect, useState, useCallback } from "react";
import GraphView from "./components/GraphView";
import Timeline from "./components/Timeline";
import { fetchGraphBySession, fetchContext, fetchSessions } from "./api/synq";

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
  createdAt: string;
  updatedAt: string;
}

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"graph" | "history">("graph");
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
    } catch {
      console.error("Could not fetch sessions");
    }
  }, []);

  const loadSession = useCallback(async (session: Session) => {
    setActiveSession(session);
    setLoading(true);
    try {
      const [graphData, contextData] = await Promise.all([
        fetchGraphBySession(session._id),
        fetchContext(session._id),
      ]);
      setNodes(graphData.nodes);
      setLinks(graphData.links);
      setTriples(contextData.triples || []);
    } catch {
      console.error("Could not load session");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load sessions list on boot and every 10s
  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // Auto load most recent session on first load
  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      loadSession(sessions[0]);
    }
  }, [sessions, activeSession, loadSession]);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      background: "#0f0f1a",
      color: "#cdd6f4",
      fontFamily: "monospace",
      overflow: "hidden",
    }}>

      {/* Left Sidebar — Session History */}
      <div style={{
        width: "240px",
        minWidth: "240px",
        background: "#1e1e2e",
        borderRight: "1px solid #313244",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: "16px",
          borderBottom: "1px solid #313244",
        }}>
          <div style={{ color: "#6366f1", fontSize: "16px", fontWeight: "bold" }}>
            ⚡ SYNQ
          </div>
          <div style={{ color: "#6c7086", fontSize: "11px", marginTop: "2px" }}>
            Knowledge Graph
          </div>
        </div>

        {/* Sessions Label */}
        <div style={{
          padding: "12px 16px 6px",
          fontSize: "10px",
          color: "#45475a",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          Captured Sessions
        </div>

        {/* Session List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sessions.length === 0 ? (
            <div style={{
              padding: "16px",
              fontSize: "12px",
              color: "#45475a",
            }}>
              No sessions yet. Capture a chat using the extension.
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s._id}
                onClick={() => loadSession(s)}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  borderLeft: activeSession?._id === s._id
                    ? "3px solid #6366f1"
                    : "3px solid transparent",
                  background: activeSession?._id === s._id
                    ? "#313244"
                    : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (activeSession?._id !== s._id)
                    (e.currentTarget as HTMLElement).style.background = "#262637";
                }}
                onMouseLeave={(e) => {
                  if (activeSession?._id !== s._id)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <div style={{
                  fontSize: "13px",
                  color: activeSession?._id === s._id ? "#cdd6f4" : "#a6adc8",
                  marginBottom: "3px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {s.projectName}
                </div>
                <div style={{ fontSize: "10px", color: "#45475a" }}>
                  {s.tripleCount} facts · {s.platform}
                </div>
                <div style={{ fontSize: "10px", color: "#45475a" }}>
                  {new Date(s.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid #313244",
          background: "#1e1e2e",
        }}>
          <div style={{ fontSize: "14px", color: "#cdd6f4" }}>
            {activeSession ? (
              <>
                <span style={{ color: "#6366f1" }}>{activeSession.projectName}</span>
                <span style={{ color: "#45475a", marginLeft: "12px", fontSize: "12px" }}>
                  {activeSession.tripleCount} facts · {activeSession.platform}
                </span>
              </>
            ) : (
              <span style={{ color: "#45475a" }}>No session selected</span>
            )}
          </div>

          {/* Stats */}
          <div style={{
            display: "flex",
            gap: "24px",
            fontSize: "12px",
            color: "#6c7086",
          }}>
            <span>Nodes: <strong style={{ color: "#cdd6f4" }}>{nodes.length}</strong></span>
            <span>Edges: <strong style={{ color: "#cdd6f4" }}>{links.length}</strong></span>
            <span>Facts: <strong style={{ color: "#cdd6f4" }}>{triples.length}</strong></span>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid #313244",
          background: "#1e1e2e",
          paddingLeft: "24px",
        }}>
          {(["graph", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid #6366f1" : "2px solid transparent",
                color: activeTab === tab ? "#6366f1" : "#6c7086",
                padding: "10px 20px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "13px",
                textTransform: "capitalize",
              }}
            >
              {tab === "graph" ? "🕸 Graph" : "📋 History"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: "hidden", padding: "16px" }}>
          {activeTab === "graph" && (
            <div style={{
              height: "100%",
              border: "1px solid #313244",
              borderRadius: "12px",
              overflow: "hidden",
              position: "relative",
            }}>
              {loading ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#6c7086",
                }}>
                  Loading graph...
                </div>
              ) : nodes.length === 0 ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#6c7086",
                  flexDirection: "column",
                  gap: "12px",
                }}>
                  <div style={{ fontSize: "48px" }}>🕸</div>
                  <div>No graph data for this session.</div>
                </div>
              ) : (
                <GraphView nodes={nodes} links={links} />
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div style={{ height: "100%", overflowY: "auto" }}>
              {loading ? (
                <div style={{ color: "#6c7086", padding: "16px" }}>Loading...</div>
              ) : triples.length === 0 ? (
                <div style={{ color: "#6c7086", padding: "16px", fontSize: "12px" }}>
                  No facts captured for this session yet.
                </div>
              ) : (
                <div>
                  {[...triples].reverse().map((t, i) => (
                    <div key={i} style={{
                      padding: "10px 12px",
                      marginBottom: "8px",
                      background: "#1e1e2e",
                      borderRadius: "8px",
                      borderLeft: "3px solid #6366f1",
                      fontSize: "12px",
                    }}>
                      <div style={{ color: "#cdd6f4" }}>
                        <span style={{ color: "#6366f1" }}>{t.subjectType}:</span>
                        {" "}{t.subject}{" "}
                        <span style={{ color: "#6c7086" }}>—[{t.relation}]→</span>
                        {" "}<span style={{ color: "#22d3ee" }}>{t.objectType}:</span>
                        {" "}{t.object}
                      </div>
                      <div style={{ color: "#45475a", fontSize: "10px", marginTop: "4px" }}>
                        {new Date(t.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}