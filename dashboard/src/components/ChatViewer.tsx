/**
 * ChatViewer.tsx — v1.2
 *
 * Displays the full saved conversation as a scrollable chat view.
 * Each [User] and [Assistant] turn is styled differently.
 * Replaces the old topic-list sidebar with a clean conversation flow.
 */


interface Props {
  rawText: string;
  messageCount: number;
  createdAt: string;
}

const C = {
  indigo:  "#6366F1",
  cyan:    "#06B6D4",
  mint:    "#02C39A",
  cream:   "#F8FAFC",
  surface: "#1A1D27",
  border:  "#292D3E",
  muted:   "#64748B",
  dim:     "#475569",
  bg:      "#0F111A",
  userBg:  "rgba(99, 102, 241, 0.15)",
  userBorder: "rgba(99, 102, 241, 0.4)",
  asstBg: "rgba(6, 182, 212, 0.12)",
  asstBorder: "rgba(6, 182, 212, 0.35)",
};

interface Turn {
  role: "user" | "assistant";
  text: string;
}

function parseTurns(rawText: string): Turn[] {
  const turns: Turn[] = [];
  // Split on [User]: or [Assistant]: markers
  const parts = rawText.split(/\n*\[(User|Assistant)\]:\s*/i);

  // parts[0] is anything before the first marker (usually empty)
  // parts[1] = "User" or "Assistant", parts[2] = content, etc.
  for (let i = 1; i < parts.length; i += 2) {
    const role = parts[i].toLowerCase() === "user" ? "user" : "assistant";
    const text = (parts[i + 1] || "").trim();
    if (text.length > 0) {
      turns.push({ role, text });
    }
  }

  // Fallback: if no markers found, show as single block
  if (turns.length === 0 && rawText.trim().length > 0) {
    turns.push({ role: "assistant", text: rawText.trim() });
  }

  return turns;
}

export default function ChatViewer({ rawText, messageCount, createdAt }: Props) {
  const turns = parseTurns(rawText);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header bar */}
      <div style={{
        padding: "10px 16px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: "11px", color: C.muted }}>
          {turns.length} turn{turns.length !== 1 ? "s" : ""} · {messageCount} messages · saved {new Date(createdAt).toLocaleDateString()}
        </div>
        <div style={{
          fontSize: "9px",
          color: C.dim,
          background: `${C.indigo}15`,
          padding: "3px 8px",
          borderRadius: 4,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          RAW CONVERSATION
        </div>
      </div>

      {/* Scrollable chat */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        {turns.map((turn, i) => {
          const isUser = turn.role === "user";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
              }}
            >
              {/* Role label */}
              <div style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: isUser ? C.indigo : C.cyan,
                marginBottom: 4,
                paddingLeft: isUser ? 0 : 4,
                paddingRight: isUser ? 4 : 0,
              }}>
                {isUser ? "YOU" : "ASSISTANT"}
              </div>

              {/* Message bubble */}
              <div style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: isUser ? C.userBg : C.asstBg,
                border: `1px solid ${isUser ? C.userBorder : C.asstBorder}`,
                fontSize: "13px",
                lineHeight: "1.7",
                color: C.cream,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "system-ui, sans-serif",
              }}>
                {turn.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}