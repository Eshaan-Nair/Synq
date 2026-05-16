/**
 * ChatViewer.tsx — v1.5.1
 *
 * Displays the full saved conversation as a scrollable chat view.
 */

import React, { useMemo } from "react";

interface Props {
  rawText: string;
  messageCount: number;
  createdAt: string;
  platform?: string;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
}

function parseTurns(rawText: string): Turn[] {
  const turns: Turn[] = [];
  const parts = rawText.split(/\n*\[(User|Assistant)\]:\s*/i);

  for (let i = 1; i < parts.length; i += 2) {
    const role = parts[i].toLowerCase() === "user" ? "user" : "assistant";
    const text = (parts[i + 1] || "").trim();
    if (text.length > 0) {
      turns.push({ role, text });
    }
  }

  if (turns.length === 0 && rawText.trim().length > 0) {
    turns.push({ role: "assistant", text: rawText.trim() });
  }

  return turns;
}

const ChatViewer: React.FC<Props> = ({ rawText, messageCount, createdAt, platform }) => {
  const turns = useMemo(() => parseTurns(rawText), [rawText]);

  return (
    <div className="chat-container">
      {/* Header bar */}
      <div className="chat-header">
        <div className="chat-header-meta">
          {turns.length} turn{turns.length !== 1 ? "s" : ""} · {messageCount} messages · saved {new Date(createdAt).toLocaleDateString()}
        </div>
        <div className="chat-header-label">
          RAW CONVERSATION
        </div>
      </div>

      {/* Scrollable chat */}
      <div className="chat-scroll-area">
        {turns.map((turn, i) => {
          const isUser = turn.role === "user";
          return (
            <div key={i} className={`chat-turn ${isUser ? "user" : "assistant"}`}>
              {/* Role label */}
              <div className={`chat-role-label ${isUser ? "user" : "assistant"}`}>
                {isUser ? "YOU" : (platform ? platform.toUpperCase() : "ASSISTANT")}
              </div>

              {/* Message bubble */}
              <div className={`chat-bubble ${isUser ? "user" : "assistant"}`}>
                {turn.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChatViewer;
