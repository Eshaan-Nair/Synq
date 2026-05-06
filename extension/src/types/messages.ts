/**
 * messages.ts — Type-safe Chrome extension messaging
 */

export type Platform = "claude" | "chatgpt" | "gemini" | "deepseek" | "unknown";

export type SynqMessage =
  | { type: "SAVE_CHAT"; payload: { rawText: string; sessionId: string; platform: Platform; messageCount: number } }
  | { type: "GET_CONTEXT"; payload: { sessionId: string } }
  | { type: "RAG_RETRIEVE"; payload: { prompt: string; sessionId: string; topN?: number } }
  | { type: "CREATE_SESSION"; payload: { projectName: string; platform: Platform; sessionId?: string } }
  | { type: "GET_SESSION" }
  | { type: "GET_ACTIVE_SESSION" }
  | { type: "SET_ACTIVE_SESSION"; payload: { sessionId: string | null } }
  | { type: "GET_PAUSE_STATE" }
  | { type: "SET_PAUSE_STATE"; payload: { paused: boolean } }
  | { type: "TOGGLE_PAUSE" }
  | { type: "UNLOAD_SESSION" }
  | { type: "PING" }
  | { type: "INGEST_TEXT"; payload: { text: string; sessionId: string; platform: Platform } }
  | { type: "SAVE_CHAT_FROM_POPUP"; payload: { projectName: string; platform: Platform; sessionId?: string } }
  | { type: "INJECT_NOW" }
  | { type: "PAUSE_SYNQ" }
  | { type: "RESUME_SYNQ" }
  | { type: "SESSION_CHANGED"; payload: { sessionId: string | null; projectName?: string } };
