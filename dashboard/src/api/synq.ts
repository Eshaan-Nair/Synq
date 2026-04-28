import axios, { AxiosError } from "axios";

const BASE = "http://localhost:3001";

// Issue #10 Fix: Centralized error extraction so all API calls return
// consistent error shapes instead of throwing unhandled promise rejections.
function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    return err.response?.data?.error || err.message || "Request failed";
  }
  return "Unknown error";
}

export async function fetchGraphBySession(sessionId: string) {
  const res = await axios.get(`${BASE}/api/graph/session/${sessionId}`);
  return res.data as {
    nodes: { id: string; type: string }[];
    links: { source: string; target: string; relation: string }[];
  };
}

export async function fetchContext(sessionId: string) {
  const res = await axios.get(`${BASE}/api/context/retrieve/${sessionId}`);
  return res.data;
}

export async function fetchSessions() {
  const res = await axios.get(`${BASE}/api/context/sessions`);
  return res.data as {
    sessions: {
      _id: string;
      projectName: string;
      platform: string;
      tripleCount: number;
      topicCount?: number;
      hasFullChat?: boolean;
      createdAt: string;
      updatedAt: string;
    }[];
  };
}

export async function setActiveSession(sessionId: string) {
  const res = await axios.post(`${BASE}/api/context/active`, { sessionId });
  return res.data;
}

export async function deleteSession(sessionId: string) {
  const res = await axios.delete(`${BASE}/api/context/session/${sessionId}`);
  return res.data;
}

export { extractErrorMessage };