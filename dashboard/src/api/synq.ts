import axios from "axios";

const BASE = "http://localhost:3001";

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
      createdAt: string;
      updatedAt: string;
    }[];
  };
}