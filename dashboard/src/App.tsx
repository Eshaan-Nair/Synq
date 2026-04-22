import { useEffect, useState, useCallback } from "react";
import GraphView from "./components/GraphView";
import { fetchGraphBySession, fetchContext, fetchSessions, setActiveSession as setActiveSessionOnBackend, deleteSession } from "./api/synq";

const C = {
  baltic:  "#05668D",
  teal:    "#028090",
  verd:    "#00A896",
  mint:    "#02C39A",
  cream:   "#F0F3BD",
  bg:      "#021f2e",
  surface: "#032a3d",
  border:  "#04445e",
  muted:   "#5a9aaa",
  dim:     "#3a7a8a",
  text:    "#F0F3BD",
  subtext: "#a0d4c4",
};

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
  const [loadedToExtension, setLoadedToExtension] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);

      if (activeSession?._id === sessionId) {
        setActiveSession(null);
        setNodes([]);
        setLinks([]);
        setTriples([]);
      }

      const data = await fetchSessions();
      setSessions(data.sessions);

      if (activeSession?._id === sessionId && data.sessions.length > 0) {
        loadSession(data.sessions[0]);
      }
    } catch {
      console.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  // Auto clear if active session no longer exists
  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSession(null);
      setNodes([]);
      setLinks([]);
      setTriples([]);
      return;
    }
    if (activeSession) {
      const stillExists = sessions.find(s => s._id === activeSession._id);
      if (!stillExists) {
        setActiveSession(null);
        setNodes([]);
        setLinks([]);
        setTriples([]);
      }
    }
  }, [sessions, activeSession]);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      loadSession(sessions[0]);
    }
  }, [sessions, activeSession, loadSession]);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      background: C.bg,
      color: C.text,
      fontFamily: "'Courier New', Courier, monospace",
      overflow: "hidden",
      margin: 0,
      padding: 0,
    }}>

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <div style={{
        width: "260px",
        minWidth: "260px",
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Logo */}
        <div style={{
          padding: "22px 16px 16px",
          borderBottom: `1px solid ${C.border}`,
          textAlign: "center",
        }}>
          <div style={{
            color: C.cream,
            fontSize: "28px",
            fontWeight: "900",
            letterSpacing: "0.2em",
          }}>
            ⚡ SYNQ
          </div>
          <div style={{
            color: C.dim,
            fontSize: "12px",
            marginTop: "4px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Knowledge Graph
          </div>
        </div>

        {/* Section label */}
        <div style={{
          padding: "14px 16px 8px",
          fontSize: "11px",
          color: C.mint,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          fontWeight: "700",
          textAlign: "center",
        }}>
          Captured Sessions
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sessions.length === 0 ? (
            <div style={{
              padding: "16px",
              fontSize: "13px",
              color: C.dim,
              textAlign: "center",
            }}>
              No sessions yet.
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = activeSession?._id === s._id;
              return (
                <div
                  key={s._id}
                  onClick={() => loadSession(s)}
                  style={{
                    padding: "11px 16px",
                    cursor: "pointer",
                    borderLeft: isActive ? `3px solid ${C.mint}` : `3px solid transparent`,
                    background: isActive ? `${C.baltic}55` : "transparent",
                    transition: "all 0.15s",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = `${C.baltic}33`;
                    const btn = (e.currentTarget as HTMLElement).querySelector(".del-btn") as HTMLElement;
                    if (btn) btn.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                    const btn = (e.currentTarget as HTMLElement).querySelector(".del-btn") as HTMLElement;
                    if (btn) btn.style.opacity = "0";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{
                      fontSize: "14px",
                      fontWeight: "700",
                      color: isActive ? C.cream : C.subtext,
                      marginBottom: "3px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "180px",
                    }}>
                      {s.projectName}
                    </div>
                    <button
                      className="del-btn"
                      onClick={(e) => handleDelete(e, s._id)}
                      style={{
                        opacity: 0,
                        background: "transparent",
                        border: "none",
                        color: "#ff6b6b",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "0 2px",
                        lineHeight: 1,
                        transition: "opacity 0.15s",
                        flexShrink: 0,
                      }}
                      title="Delete session"
                    >
                      {deletingId === s._id ? "..." : "✕"}
                    </button>
                  </div>
                  <div style={{ fontSize: "11px", color: C.muted }}>
                    {s.tripleCount} facts · {s.platform}
                  </div>
                  <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 28px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
          flexShrink: 0,
        }}>
          <div>
            {activeSession ? (
              <>
                <span style={{ color: C.cream, fontSize: "22px", fontWeight: "800", letterSpacing: "0.04em" }}>
                  {activeSession.projectName}
                </span>
                <span style={{ color: C.muted, fontSize: "14px", marginLeft: "14px" }}>
                  {activeSession.tripleCount} facts · {activeSession.platform}
                </span>
              </>
            ) : (
              <span style={{ color: C.dim, fontSize: "18px" }}>No session selected</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {activeSession && (
              <button
                onClick={async () => {
                  await setActiveSessionOnBackend(activeSession._id);
                  setLoadedToExtension(true);
                  setTimeout(() => setLoadedToExtension(false), 3000);
                }}
                style={{
                  background: loadedToExtension ? C.mint : C.verd,
                  color: loadedToExtension ? C.bg : C.cream,
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: "0.05em",
                  transition: "all 0.3s",
                }}
              >
                {loadedToExtension ? "✅ Loaded!" : "⚡ Load into Extension"}
              </button>
            )}

            <div style={{ display: "flex", gap: "28px", fontSize: "14px", color: C.muted }}>
              <span>Nodes: <strong style={{ color: C.cream, fontSize: "16px" }}>{nodes.length}</strong></span>
              <span>Edges: <strong style={{ color: C.cream, fontSize: "16px" }}>{links.length}</strong></span>
              <span>Facts: <strong style={{ color: C.cream, fontSize: "16px" }}>{triples.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
          paddingLeft: "28px",
          flexShrink: 0,
        }}>
          {(["graph", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activeTab === tab ? `2px solid ${C.mint}` : "2px solid transparent",
                color: activeTab === tab ? C.mint : C.muted,
                padding: "12px 24px",
                cursor: "pointer",
                fontFamily: "'Courier New', monospace",
                fontSize: "14px",
                fontWeight: activeTab === tab ? "700" : "400",
                letterSpacing: "0.05em",
                transition: "all 0.15s",
              }}
            >
              {tab === "graph" ? "🕸 Graph" : "📋 History"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden", padding: "16px" }}>
          {activeTab === "graph" && (
            <div style={{
              height: "100%",
              border: `1px solid ${C.border}`,
              borderRadius: "10px",
              overflow: "hidden",
              background: C.bg,
            }}>
              {loading ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: "100%", color: C.muted, fontSize: "15px",
                }}>
                  Loading graph...
                </div>
              ) : nodes.length === 0 ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: "100%", color: C.dim, flexDirection: "column", gap: "14px",
                }}>
                  <div style={{ fontSize: "52px" }}>🕸</div>
                  <div style={{ fontSize: "16px" }}>No graph data for this session.</div>
                </div>
              ) : (
                <GraphView nodes={nodes} links={links} />
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div style={{ height: "100%", overflowY: "auto" }}>
              {loading ? (
                <div style={{ color: C.muted, padding: "16px", fontSize: "14px" }}>Loading...</div>
              ) : triples.length === 0 ? (
                <div style={{ color: C.dim, padding: "16px", fontSize: "14px" }}>
                  No facts captured for this session yet.
                </div>
              ) : (
                <div>
                  {[...triples].reverse().map((t, i) => (
                    <div key={i} style={{
                      padding: "12px 16px",
                      marginBottom: "8px",
                      background: C.surface,
                      borderRadius: "8px",
                      borderLeft: `3px solid ${C.verd}`,
                      fontSize: "13px",
                    }}>
                      <div style={{ color: C.cream }}>
                        <span style={{ color: C.mint, fontWeight: "700" }}>{t.subjectType}:</span>
                        {" "}{t.subject}{" "}
                        <span style={{ color: C.muted }}>—[{t.relation}]→</span>
                        {" "}<span style={{ color: C.mint, fontWeight: "700" }}>{t.objectType}:</span>
                        {" "}{t.object}
                      </div>
                      <div style={{ color: C.dim, fontSize: "11px", marginTop: "5px" }}>
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