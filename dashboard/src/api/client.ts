import axios from "axios";

// v1.4.5+: Configurable backend URL and auth secret via environment variables
const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
export const SECRET = import.meta.env.VITE_SYNQ_SECRET || "";

export const apiClient = axios.create({
  baseURL: BACKEND,
  headers: {
    "Content-Type": "application/json"
  }
});

apiClient.interceptors.request.use(config => {
  if (SECRET) {
    config.headers["X-SYNQ-Secret"] = SECRET;
  }
  return config;
});

// Helper to extract clean error messages
export function extractErrorMessage(err: any): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.message || "Request failed";
  }
  return String(err);
}
