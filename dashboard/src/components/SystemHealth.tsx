import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../api/client";

interface HealthData {
  storageMode: string;
  sessionCount: number;
  chunkCount: number;
  graphBackend: string;
  jobQueue: {
    pending: number;
    processing: number;
    failed: number;
    deadLettered: number;
  };
  ollama: {
    reachable: boolean;
    model: string;
  };
}

export function SystemHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/health");
      setHealth(res.data as HealthData);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const timer = setInterval(() => setLastUpdated(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const storageBadgeColor = health?.storageMode === "sqlite" ? "#818CF8" : "#34D399";

  return (
    <div className="system-health-panel">
      <div className="health-header">
        <span className="health-title">System Health</span>
        {lastUpdated && (
          <span className="health-updated">
            {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>

      {loading && <div className="health-loading">Checking system...</div>}

      {error && !loading && (
        <div className="health-error">
          <span className="health-indicator red" /> Backend unreachable
        </div>
      )}

      {health && !error && (
        <div className="health-metrics">
          {/* Storage Mode */}
          <div className="health-row">
            <span className="health-label">Storage</span>
            <span className="health-badge" style={{ background: storageBadgeColor + "22", color: storageBadgeColor, border: `1px solid ${storageBadgeColor}44` }}>
              {health.storageMode.toUpperCase()}
            </span>
          </div>

          {/* Sessions + Graph Backend */}
          <div className="health-row">
            <span className="health-label">Sessions</span>
            <span className="health-value">{health.sessionCount}</span>
          </div>
          {/* Job Queue */}
          <div className="health-row">
            <span className="health-label">Job Queue</span>
            <span className="health-queue">
              {health.jobQueue.pending > 0 && (
                <span className="queue-pill pending">{health.jobQueue.pending} pending</span>
              )}
              {health.jobQueue.processing > 0 && (
                <span className="queue-pill processing">{health.jobQueue.processing} active</span>
              )}
              {health.jobQueue.failed > 0 && (
                <span className="queue-pill failed">{health.jobQueue.failed} failed</span>
              )}
              {health.jobQueue.pending === 0 && health.jobQueue.processing === 0 && health.jobQueue.failed === 0 && (
                <span className="queue-pill idle">Idle</span>
              )}
            </span>
          </div>

          <div className="health-row">
            <span className="health-label">Graph</span>
            <span className="health-value">{health.graphBackend}</span>
          </div>

          {/* Ollama */}
          <div className="health-row">
            <span className="health-label">Ollama</span>
            <span className="health-ollama">
              <span className={`health-indicator ${health.ollama.reachable ? "green" : "red"}`} />
              {health.ollama.reachable ? `Connected (${health.ollama.model})` : "Unreachable"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
