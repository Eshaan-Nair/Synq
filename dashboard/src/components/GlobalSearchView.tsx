import React, { useState, useEffect } from "react";
import { searchGlobal } from "../api/glia";

export const GlobalSearchView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ chunks: any[], facts: any[] }>({ chunks: [], facts: [] });
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        setIsSearching(true);
        try {
          const res = await searchGlobal(searchQuery);
          setSearchResults({
            chunks: res.found ? res.chunks : [],
            facts: res.graphFacts || []
          });
        } catch (err) {
          console.error("Search failed:", err);
          setSearchResults({ chunks: [], facts: [] });
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults({ chunks: [], facts: [] });
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  return (
    <div style={{ padding: "32px", maxWidth: "800px", margin: "0 auto", color: "var(--text-primary)", width: "100%", minHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", marginTop: searchResults.chunks.length === 0 && searchResults.facts.length === 0 && searchQuery.length < 3 ? "30vh" : "40px", transition: "margin-top 0.3s ease", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ fontFamily: "Outfit", fontSize: "32px", marginBottom: "24px" }}>Global Search</h2>
        <input
          type="text"
          placeholder="Search all projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "16px 24px",
            background: "var(--surface-elevated)",
            border: "1px solid var(--border-dim)",
            borderRadius: "12px",
            color: "var(--text-primary)",
            fontSize: "20px",
            outline: "none",
            textAlign: "center"
          }}
        />
        
        <div style={{ marginTop: "32px", width: "100%" }}>
        {isSearching ? (
          <div>Searching...</div>
        ) : (searchResults.chunks.length > 0 || searchResults.facts.length > 0) ? (
          <>
            {searchResults.facts.length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ color: "var(--primary)", marginBottom: "12px" }}>Facts</h3>
                {searchResults.facts.map((fact, i) => (
                  <div key={`fact-${i}`} style={{ padding: "12px", background: "var(--surface-elevated)", borderRadius: "6px", borderLeft: "3px solid var(--secondary)", marginBottom: "8px" }}>
                    <span style={{ color: "var(--secondary)", fontWeight: "600" }}>{fact.subject}</span>{" "}
                    <span style={{ color: "var(--text-secondary)" }}>{fact.relation}</span>{" "}
                    <span style={{ color: "var(--secondary)", fontWeight: "600" }}>{fact.object}</span>
                  </div>
                ))}
              </div>
            )}
            {searchResults.chunks.length > 0 && (
              <div>
                <h3 style={{ color: "var(--primary)", marginBottom: "12px" }}>Context</h3>
                {searchResults.chunks.map((result, i) => (
                  <div key={`chunk-${i}`} style={{ padding: "12px", background: "var(--surface-elevated)", borderRadius: "6px", borderLeft: "3px solid var(--primary)", marginBottom: "8px" }}>
                    <div style={{ color: "var(--primary)", fontWeight: "600", marginBottom: "8px", fontSize: "12px", textTransform: "uppercase" }}>
                      {result.projectName || "Unknown Project"}
                    </div>
                    <div style={{ color: "var(--text-primary)", lineHeight: "1.5" }}>
                      {result.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : searchQuery.length > 2 ? (
          <div>No results found.</div>
        ) : (
          <div style={{ opacity: 0.5 }}>Type at least 3 characters to search.</div>
        )}
      </div>
      </div>
    </div>
  );
};
