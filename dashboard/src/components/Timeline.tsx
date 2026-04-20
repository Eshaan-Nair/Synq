interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
  timestamp: string;
}

interface Props {
  triples: Triple[];
}

export default function Timeline({ triples }: Props) {
  if (triples.length === 0) {
    return (
      <div style={{ color: "#6c7086", fontSize: "12px", padding: "16px" }}>
        No facts captured yet. Start a session and chat!
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", maxHeight: "100%" }}>
      {[...triples].reverse().map((t, i) => (
        <div
          key={i}
          style={{
            padding: "10px 12px",
            marginBottom: "8px",
            background: "#1e1e2e",
            borderRadius: "8px",
            borderLeft: "3px solid #6366f1",
            fontFamily: "monospace",
            fontSize: "12px",
          }}
        >
          <div style={{ color: "#cdd6f4" }}>
            <span style={{ color: "#6366f1" }}>{t.subjectType}:</span>
            {t.subject}
            {" "}
            <span style={{ color: "#6c7086" }}>—[{t.relation}]→</span>
            {" "}
            <span style={{ color: "#22d3ee" }}>{t.objectType}:</span>
            {t.object}
          </div>
          <div style={{ color: "#45475a", fontSize: "10px", marginTop: "4px" }}>
            {new Date(t.timestamp).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}