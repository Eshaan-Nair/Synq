import axios from "axios";

// v1.4.7: Configurable backend URL and auth secret via environment variables
const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
export const apiClient = axios.create({
  baseURL: BACKEND,
  headers: {
    "Content-Type": "application/json"
  }
});

// Helper to extract clean error messages
export function extractErrorMessage(err: any): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.message || "Request failed";
  }
  return String(err);
}
