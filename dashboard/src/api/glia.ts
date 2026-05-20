import { apiClient, extractErrorMessage } from "./client";

export async function fetchGraphBySession(sessionId: string) {
  const res = await apiClient.get(`/api/graph/session/${sessionId}`);
  return res.data as {
    nodes: { id: string; type: string }[];
    links: { source: string; target: string; relation: string }[];
  };
}

export async function fetchContext(sessionId: string) {
  const res = await apiClient.get(`/api/context/retrieve/${sessionId}`);
  return res.data;
}

export async function fetchSessions() {
  const res = await apiClient.get(`/api/context/sessions`);
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
  const res = await apiClient.post(`/api/context/active`, { sessionId });
  return res.data;
}

export async function deleteSession(sessionId: string) {
  const res = await apiClient.delete(`/api/context/session/${sessionId}`);
  return res.data;
}

export async function exportSession(sessionId: string) {
  // Use direct URL for download - assumes API_URL is correct in apiClient
  const baseUrl = apiClient.defaults.baseURL || "http://localhost:3001";
  const url = new URL(`${baseUrl}/api/session/export/${sessionId}`);
  window.open(url.toString(), "_blank");
}

export async function importSession(data: any) {
  const res = await apiClient.post(`/api/session/import`, { data });
  return res.data;
}

export async function searchGlobal(prompt: string) {
  const res = await apiClient.post(`/api/rag/global`, { prompt, topN: 10 });
  return res.data as {
    found: boolean;
    chunks: { content: string; projectName?: string }[];
    graphFacts: { subject: string; relation: string; object: string; sessionId?: string }[];
    scores?: number[];
  };
}

export async function pruneGraphNode(prompt: string, sessionId?: string) {
  const res = await apiClient.post(`/api/graph/prune`, { prompt, sessionId });
  return res.data;
}

export { extractErrorMessage, apiClient };
