import React from "react";
import { TYPE_COLORS } from "../../constants";

interface LegendProps {
  types: string[];
  graphTypeFilter: string | null;
  onFilterToggle: (type: string) => void;
}

const Legend: React.FC<LegendProps> = ({ types, graphTypeFilter, onFilterToggle }) => {
  return (
    <div className="legend-sidebar-list">
      <div className="legend-items" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
        {types.map(type => (
          <div
            key={type}
            className={`filter-pill ${graphTypeFilter === type ? "active" : ""}`}
            onClick={() => onFilterToggle(type)}
            style={{ width: "100%" }}
          >
            <div
              className="legend-dot"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: TYPE_COLORS[type],
                marginRight: "12px",
                flexShrink: 0
              }}
            />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Legend;
