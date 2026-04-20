import axios from "axios";

const BASE = "http://localhost:3001";

export async function fetchGraph() {
  const res = await axios.get(`${BASE}/api/graph/all`);
  return res.data as {
    nodes: { id: string; type: string }[];
    links: { source: string; target: string; relation: string }[];
  };
}

export async function fetchContext(sessionId: string) {
  const res = await axios.get(`${BASE}/api/context/retrieve/${sessionId}`);
  return res.data;
}