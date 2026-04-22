import { useEffect, useState, useCallback } from "react";
import GraphView from "./components/GraphView";
import { fetchGraphBySession, fetchContext, fetchSessions, setActiveSession as setActiveSessionOnBackend } from "./api/synq";

// ── Colour palette ─────────────────────────────────────────────────
const C = {
  cream:   "#FBDB93",
  coral:   "#BE5B50",
  wine:    "#8A2D3B",
  deep:    "#641B2E",
  bg:      "#1a0a10",
  surface: "#2a1018",
  border:  "#3d1520",
  muted:   "#7a4a52",
  text:    "#FBDB93",
  subtext: "#c49a6e",
  dim:     "#7a5a4a",
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
      boxSizing: "border-box",
    }}>

      {/* ── Left Sidebar ──────────────────────────────────────────── */}
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
          padding: "20px 20px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{
            color: C.cream,
            fontSize: "26px",
            fontWeight: "900",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}>
            ⚡ SYNQ
          </div>
          <div style={{
            color: C.dim,
            fontSize: "13px",
            marginTop: "4px",
            letterSpacing: "0.05em",
          }}>
            Knowledge Graph
          </div>
        </div>

        {/* Section label */}
        <div style={{
          padding: "14px 20px 8px",
          fontSize: "11px",
          color: C.coral,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          fontWeight: "700",
        }}>
          Captured Sessions
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sessions.length === 0 ? (
            <div style={{ padding: "16px 20px", fontSize: "13px", color: C.dim }}>
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
                    padding: "12px 20px",
                    cursor: "pointer",
                    borderLeft: isActive ? `3px solid ${C.coral}` : `3px solid transparent`,
                    background: isActive ? `${C.deep}88` : "transparent",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = `${C.deep}44`;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <div style={{
                    fontSize: "15px",
                    fontWeight: "700",
                    color: isActive ? C.cream : C.subtext,
                    marginBottom: "4px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    letterSpacing: "0.03em",
                  }}>
                    {s.projectName}
                  </div>
                  <div style={{ fontSize: "12px", color: C.muted }}>
                    {s.tripleCount} facts · {s.platform}
                  </div>
                  <div style={{ fontSize: "11px", color: C.dim, marginTop: "2px" }}>
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
          {/* Session title */}
          <div>
            {activeSession ? (
              <>
                <span style={{
                  color: C.cream,
                  fontSize: "22px",
                  fontWeight: "800",
                  letterSpacing: "0.05em",
                }}>
                  {activeSession.projectName}
                </span>
                <span style={{
                  color: C.muted,
                  fontSize: "14px",
                  marginLeft: "14px",
                  letterSpacing: "0.03em",
                }}>
                  {activeSession.tripleCount} facts · {activeSession.platform}
                </span>
              </>
            ) : (
              <span style={{ color: C.dim, fontSize: "18px" }}>No session selected</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {/* Load into Extension */}
            {activeSession && (
              <button
                onClick={async () => {
                  await setActiveSessionOnBackend(activeSession._id);
                  setLoadedToExtension(true);
                  setTimeout(() => setLoadedToExtension(false), 3000);
                }}
                style={{
                  background: loadedToExtension ? C.cream : C.coral,
                  color: loadedToExtension ? C.deep : C.cream,
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

            {/* Stats */}
            <div style={{ display: "flex", gap: "28px", fontSize: "14px", color: C.muted }}>
              <span>Nodes: <strong style={{ color: C.cream, fontSize: "16px" }}>{nodes.length}</strong></span>
              <span>Edges: <strong style={{ color: C.cream, fontSize: "16px" }}>{links.length}</strong></span>
              <span>Facts: <strong style={{ color: C.cream, fontSize: "16px" }}>{triples.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
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
                borderBottom: activeTab === tab ? `2px solid ${C.coral}` : "2px solid transparent",
                color: activeTab === tab ? C.coral : C.muted,
                padding: "12px 24px",
                cursor: "pointer",
                fontFamily: "'Courier New', monospace",
                fontSize: "14px",
                fontWeight: activeTab === tab ? "700" : "400",
                letterSpacing: "0.05em",
                textTransform: "capitalize",
                transition: "all 0.15s",
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
              border: `1px solid ${C.border}`,
              borderRadius: "10px",
              overflow: "hidden",
              position: "relative",
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
                      borderLeft: `3px solid ${C.coral}`,
                      fontSize: "13px",
                    }}>
                      <div style={{ color: C.cream }}>
                        <span style={{ color: C.coral, fontWeight: "700" }}>{t.subjectType}:</span>
                        {" "}{t.subject}{" "}
                        <span style={{ color: C.muted }}>—[{t.relation}]→</span>
                        {" "}<span style={{ color: C.cream, fontWeight: "700" }}>{t.objectType}:</span>
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