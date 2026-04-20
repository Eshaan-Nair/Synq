import { useEffect, useState, useCallback } from "react";
import GraphView from "./components/GraphView";
import Timeline from "./components/Timeline";
import { fetchGraph, fetchContext } from "./api/synq";

interface Node { id: string; type: string; }
interface Link { source: string; target: string; relation: string; }
interface Triple {
  subject: string; subjectType: string;
  relation: string;
  object: string; objectType: string;
  timestamp: string;
}

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [inputId, setInputId] = useState("");
  const [activeTab, setActiveTab] = useState<"graph" | "timeline">("graph");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const loadGraph = useCallback(async () => {
    try {
      const data = await fetchGraph();
      setNodes(data.nodes);
      setLinks(data.links);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      console.error("Could not reach backend");
    }
  }, []);

  const loadContext = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchContext(id);
      setTriples(data.triples || []);
    } catch {
      console.error("Could not fetch context");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh graph every 10 seconds
  useEffect(() => {
    loadGraph();
    const interval = setInterval(loadGraph, 10000);
    return () => clearInterval(interval);
  }, [loadGraph]);

  function handleLoadSession() {
    loadContext(inputId);
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      background: "#0f0f1a",
      color: "#cdd6f4",
      fontFamily: "monospace",
    }}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid #313244",
        background: "#1e1e2e",
      }}>
        <div>
          <span style={{ color: "#6366f1", fontSize: "18px", fontWeight: "bold" }}>
            ⚡ SYNQ
          </span>
          <span style={{ color: "#6c7086", fontSize: "12px", marginLeft: "12px" }}>
            Knowledge Graph Dashboard
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            placeholder="Paste Session ID..."
            style={{
              background: "#0f0f1a",
              border: "1px solid #313244",
              borderRadius: "6px",
              color: "#cdd6f4",
              padding: "6px 10px",
              fontSize: "12px",
              fontFamily: "monospace",
              width: "220px",
            }}
          />
          <button
            onClick={handleLoadSession}
            style={{
              background: "#6366f1",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            Load Session
          </button>
          <span style={{ color: "#45475a", fontSize: "11px" }}>
            {lastUpdated ? `Updated ${lastUpdated}` : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: "flex",
        gap: "0",
        borderBottom: "1px solid #313244",
        background: "#1e1e2e",
        paddingLeft: "24px",
      }}>
        {(["graph", "timeline"] as const).map((tab) => (
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
            {tab === "graph" ? "🕸 Graph" : "📋 Timeline"}
          </button>
        ))}

        {/* Stats */}
        <div style={{
          marginLeft: "auto",
          display: "flex",
          gap: "24px",
          alignItems: "center",
          paddingRight: "24px",
          fontSize: "12px",
          color: "#6c7086",
        }}>
          <span>Nodes: <strong style={{ color: "#cdd6f4" }}>{nodes.length}</strong></span>
          <span>Edges: <strong style={{ color: "#cdd6f4" }}>{links.length}</strong></span>
          <span>Facts: <strong style={{ color: "#cdd6f4" }}>{triples.length}</strong></span>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "hidden", padding: "16px" }}>
        {activeTab === "graph" && (
          <div style={{
            height: "100%",
            border: "1px solid #313244",
            borderRadius: "12px",
            overflow: "hidden",
          }}>
            {nodes.length === 0 ? (
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
                <div>No graph data yet.</div>
                <div style={{ fontSize: "12px" }}>
                  Start a session in the extension and chat with an AI.
                </div>
              </div>
            ) : (
              <GraphView nodes={nodes} links={links} />
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            {loading ? (
              <div style={{ color: "#6c7086", padding: "16px" }}>Loading...</div>
            ) : (
              <Timeline triples={triples} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}