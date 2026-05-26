import React, { useEffect, useState } from "react";
import { fetchSettings, updateSettings, extractErrorMessage } from "../api/ArcRift";

const SettingsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [ollamaReachable, setOllamaReachable] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [activeEmbeddingModel, setActiveEmbeddingModel] = useState("nomic-embed-text");
  const [activeExtractionModel, setActiveExtractionModel] = useState("llama3.1:8b");

  const [originalSettings, setOriginalSettings] = useState({
    embedding: "nomic-embed-text",
    extraction: "llama3.1:8b",
  });

  const [saving, setSaving] = useState(false);

  const loadSettingsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      setOllamaReachable(data.ollamaReachable);
      setAvailableModels(data.availableModels);
      setActiveEmbeddingModel(data.activeEmbeddingModel);
      setActiveExtractionModel(data.activeExtractionModel);
      setOriginalSettings({
        embedding: data.activeEmbeddingModel,
        extraction: data.activeExtractionModel,
      });
    } catch (err) {
      setError(`Failed to load settings: ${extractErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await updateSettings({
        activeEmbeddingModel,
        activeExtractionModel,
      });
      setOriginalSettings({
        embedding: activeEmbeddingModel,
        extraction: activeExtractionModel,
      });
      setSuccessMessage("Configuration saved successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(`Failed to save settings: ${extractErrorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges =
    activeEmbeddingModel !== originalSettings.embedding ||
    activeExtractionModel !== originalSettings.extraction;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "40px", color: "var(--text-secondary)" }}>
        <div className="processing-dot" style={{ width: "16px", height: "16px", marginBottom: "16px" }} />
        <span>Loading system configurations...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "800px", margin: "100px auto 40px auto", padding: "0 24px" }}>
      {/* Header Card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-main)", borderRadius: "16px", backdropFilter: "var(--surface-blur)", padding: "32px", marginBottom: "24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "28px", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: "4px" }}>
              System Settings
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Configure active models for local embeddings generation and knowledge graph relationship extraction.
            </p>
          </div>
          <button onClick={loadSettingsData} className="action-btn" title="Refresh Settings" style={{ padding: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </div>

        {/* Ollama Status Pill */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.2)", padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--border-dim)", fontSize: "12px" }}>
          <span className={`health-indicator ${ollamaReachable ? "green" : "red"}`} style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", boxShadow: ollamaReachable ? "0 0 8px #10B981" : "0 0 8px #EF4444" }} />
          <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Ollama Connection:</span>
          <span style={{ color: ollamaReachable ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
            {ollamaReachable ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Main Switcher Card */}
      <form onSubmit={handleSave} style={{ background: "var(--surface)", border: "1px solid var(--border-main)", borderRadius: "16px", backdropFilter: "var(--surface-blur)", padding: "32px", display: "flex", flexDirection: "column", gap: "28px" }}>
        
        {/* Ollama Offline Warning Banner */}
        {!ollamaReachable && (
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "10px", padding: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" style={{ flexShrink: 0, marginTop: "2px" }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
            </svg>
            <div>
              <h4 style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>Local LLM Connection Offline</h4>
              <p style={{ color: "var(--text-secondary)", fontSize: "12px", lineHeight: "1.4" }}>
                Make sure Ollama is running locally with <code style={{ color: "var(--text-primary)", background: "rgba(255,255,255,0.05)", padding: "2px 4px", borderRadius: "4px" }}>ollama serve</code> so ArcRift can query available models and process your knowledge graph locally.
              </p>
            </div>
          </div>
        )}

        {/* Embedding Model Config */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
            <span>Text Embedding Model</span>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)" }}>
              Recommended: <code style={{ color: "var(--primary)", background: "rgba(249, 115, 22, 0.08)", padding: "1px 4px", borderRadius: "3px" }}>nomic-embed-text</code>
            </span>
          </label>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4", marginBottom: "4px" }}>
            Generates vector embeddings for your project data. Used to powersemantic retrieval in the RAG pipeline.
          </p>
          <select
            className="settings-select"
            value={activeEmbeddingModel}
            onChange={(e) => setActiveEmbeddingModel(e.target.value)}
            disabled={!ollamaReachable}
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", fontSize: "14px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-main)", color: "white", outline: "none", cursor: ollamaReachable ? "pointer" : "not-allowed" }}
          >
            {!ollamaReachable ? (
              <option value="nomic-embed-text">nomic-embed-text (Fallback — Offline)</option>
            ) : availableModels.length === 0 ? (
              <option value="nomic-embed-text">nomic-embed-text (No models found)</option>
            ) : (
              availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Extraction Model Config */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
            <span>Extraction LLM Model</span>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)" }}>
              Recommended: <code style={{ color: "var(--primary)", background: "rgba(249, 115, 22, 0.08)", padding: "1px 4px", borderRadius: "3px" }}>llama3.1:8b</code> or higher
            </span>
          </label>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4", marginBottom: "4px" }}>
            Powers the precision extraction pipeline. Summarizes chats, identifies key developer decisions, and builds entity relationships.
          </p>
          <select
            className="settings-select"
            value={activeExtractionModel}
            onChange={(e) => setActiveExtractionModel(e.target.value)}
            disabled={!ollamaReachable}
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", fontSize: "14px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-main)", color: "white", outline: "none", cursor: ollamaReachable ? "pointer" : "not-allowed" }}
          >
            {!ollamaReachable ? (
              <option value="llama3.1:8b">llama3.1:8b (Fallback — Offline)</option>
            ) : availableModels.length === 0 ? (
              <option value="llama3.1:8b">llama3.1:8b (No models found)</option>
            ) : (
              availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Action Panel */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-main)", paddingTop: "24px", marginTop: "8px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {error && <span style={{ color: "var(--danger)", fontSize: "13px", fontWeight: 600 }}>{error}</span>}
            {successMessage && <span style={{ color: "var(--success)", fontSize: "13px", fontWeight: 600 }}>{successMessage}</span>}
            {!error && !successMessage && hasUnsavedChanges && (
              <span style={{ color: "var(--primary)", fontSize: "12px", fontWeight: 500 }}>Unsaved changes detected.</span>
            )}
          </div>

          <button
            type="submit"
            disabled={!hasUnsavedChanges || saving}
            style={{
              padding: "12px 28px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: hasUnsavedChanges && !saving ? "pointer" : "not-allowed",
              background: hasUnsavedChanges ? "var(--primary)" : "rgba(255,255,255,0.05)",
              color: hasUnsavedChanges ? "white" : "var(--text-dim)",
              border: hasUnsavedChanges ? "1px solid transparent" : "1px solid var(--border-dim)",
              boxShadow: hasUnsavedChanges ? "0 0 15px var(--primary-glow)" : "none",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: hasUnsavedChanges && !saving ? "scale(1.02)" : "scale(1)"
            }}
          >
            {saving ? "Saving Changes..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsView;
