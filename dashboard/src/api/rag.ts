import axios from "axios";
import { extractErrorMessage } from "./synq";

const BASE = "http://localhost:3001";

export async function fetchFullChat(sessionId: string): Promise<{
  found: boolean;
  rawText?: string;
  topics?: { name: string; content: string; keywords: string[] }[];
  messageCount?: number;
  createdAt?: string;
  error?: string;
}> {
  try {
    const res = await axios.get(`${BASE}/api/chat/${sessionId}`);
    return res.data;
  } catch (err) {
    // If the backend is down or the session has no full chat, return a safe empty state
    return { found: false, error: extractErrorMessage(err) };
  }
}