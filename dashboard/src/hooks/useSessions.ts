import { useState, useCallback, useEffect } from "react";
import { fetchSessions, deleteSession, extractErrorMessage, apiClient } from "../api/glia";
import type { Session, JobStatus } from "../types";

export const useSessions = (onSessionDeleted: (sessionId: string) => void) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>({ pending: 0, processing: 0, deadLettered: 0 });
  const [sessionSearch, setSessionSearch] = useState("");

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
      setError(null);
      return data.sessions;
    } catch (err) {
      setError(`Backend unreachable: ${extractErrorMessage(err)}`);
    }
  }, []);

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      onSessionDeleted(sessionId);
      await loadSessions();
    } catch (err) {
      setError(`Delete failed: ${extractErrorMessage(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearJobs = async () => {
    try {
      await apiClient.post("/api/jobs/clear");
      setJobStatus({ pending: 0, processing: 0, deadLettered: 0 });
    } catch (err) {
      console.error("Failed to clear jobs");
    }
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => {
      if (!document.hidden) loadSessions();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const filteredSessions = sessions.filter(session =>
    session.projectName.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  return {
    sessions,
    filteredSessions,
    error,
    setError,
    deletingId,
    jobStatus,
    setJobStatus,
    sessionSearch,
    setSessionSearch,
    loadSessions,
    handleDeleteSession,
    handleClearJobs,
  };
};
