/**
 * GraphView.tsx — v1.4.4
 *
 * Fix: Node labels were broken in two ways:
 *
 * 1. TYPE text inside circle overflowed: Long type names like
 *    "CONVERSATIONAL AI ASSISTANT" were rendered at 8px inside a 20-30px
 *    radius circle, making them unreadable and visually cluttered.
 *    Fix: Show only a short abbreviation inside the circle (e.g. "PET",
 *    "PERSON", "CONCEPT"), with the full type name in the legend and tooltip.
 *
 * 2. Name label below node overlapped neighbors: The label was anchored
 *    exactly at nodeRadius + 14px below, which caused dense graphs to have
 *    overlapping text. Fix: increase vertical offset and add a subtle
 *    semi-transparent background behind the label for readability.
 */

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface Node {
  id: string;
  type: string;
  community?: number;
  firstSeen?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | Node;
  target: string | Node;
  relation: string;
  timestamp?: string;
}

interface Props {
  nodes: Node[];
  links: Link[];
  onNodeClick?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
  filterType?: string | null;
  onFilterChange?: (type: string | null) => void;
}

// ── Extended color palette (technical + personal entity types) ─────
const STATIC_TYPE_COLORS: Record<string, string> = {
  // Personal (Warm & Soft)
  Person: "#F472B6", // Pink
  Pet: "#FB923C",    // Orange
  Goal: "#34D399",   // Emerald
  Problem: "#F87171", // Red
  Preference: "#818CF8", // Indigo (Accent)
  Habit: "#FCD34D",  // Amber
  Location: "#2DD4BF", // Teal
  Organization: "#6366F1", // Indigo
  Education: "#A78BFA",   // Purple (academic)
  // Technical (Sophisticated Cools)
  Project: "#94A3B8", // Slate
  Technology: "#8B5CF6", // Violet
  Feature: "#EC4899", // Pink
  Bug: "#EF4444",    // Red
  Decision: "#F59E0B", // Amber
  Auth: "#10B981",   // Emerald
  Database: "#06B6D4", // Cyan
  Library: "#3B82F6", // Blue
  API: "#6366F1",    // Indigo
  Concept: "#D946EF", // Fuchsia
  Framework: "#7C3AED", // Violet
  Architecture: "#EAB308", // Yellow
  Tool: "#4ADE80",   // Green
  Pattern: "#2DD4BF", // Teal
  Algorithm: "#14B8A6", // Teal
  default: "#475569",
};

// Dynamic color generator for unknown types using a hash
function getDynamicColor(type: string): string {
  if (!type) return STATIC_TYPE_COLORS.default;
  if (STATIC_TYPE_COLORS[type]) return STATIC_TYPE_COLORS[type];

  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
}

// Proxy to gracefully handle both known and unknown types
const TYPE_COLORS = new Proxy(STATIC_TYPE_COLORS, {
  get: (target, prop) => {
    if (typeof prop !== "string") return target["default"];
    return getDynamicColor(prop);
  }
});



// Short abbreviation to show INSIDE the node circle.
// Keeps the circle clean and readable at any node size.
function typeAbbrev(type: string | null | undefined): string {
  if (!type) return "";
  const abbrevs: Record<string, string> = {
    Person: "PER", Pet: "PET", Goal: "GOAL", Problem: "PROB",
    Preference: "PREF", Habit: "HABIT", Location: "LOC",
    Organization: "ORG", Project: "PROJ", Technology: "TECH",
    Feature: "FEAT", Bug: "BUG", Decision: "DEC", Auth: "AUTH",
    Database: "DB", Library: "LIB", API: "API", Concept: "CON",
    Framework: "FW", Architecture: "ARCH", Tool: "TOOL",
    Pattern: "PAT", Algorithm: "ALGO",
  };
  return abbrevs[type] || type.slice(0, 4).toUpperCase();
}

export default function GraphView({ nodes, links, onNodeClick, selectedNodeId, filterType, onFilterChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const svgSelRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ id: string; type: string; degree: number } | null>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settingNodeSize, setSettingNodeSize] = useState<"normal" | "large">("normal");
  const [settingNodeLabels, setSettingNodeLabels] = useState<"always" | "hover">("hover");
  const [settingEdgeLabels, setSettingEdgeLabels] = useState<"always" | "hover">("hover");
  const [settingTension, setSettingTension] = useState<"loose" | "tight">("loose");
  // ── Zoom buttons ───────────────────────────────────────────────
  function zoomIn() { if (svgSelRef.current && zoomRef.current) svgSelRef.current.transition().duration(300).call(zoomRef.current.scaleBy, 1.4); }
  function zoomOut() { if (svgSelRef.current && zoomRef.current) svgSelRef.current.transition().duration(300).call(zoomRef.current.scaleBy, 0.7); }
  function zoomReset() { if (svgSelRef.current && zoomRef.current) svgSelRef.current.transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity); }



  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // Deep-clone filtered data so D3's force simulation cannot mutate the React state.
    const filteredNodes: Node[] = nodes.map(n => ({ ...n }));

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks: Link[] = links
      .filter(l => {
        const sId = typeof l.source === "string" ? l.source : (l.source as Node).id;
        const tId = typeof l.target === "string" ? l.target : (l.target as Node).id;
        return filteredNodeIds.has(sId) && filteredNodeIds.has(tId);
      })
      .map(l => ({
        ...l,
        // Always reset to string IDs so D3 resolves them fresh each render
        source: typeof l.source === "string" ? l.source : (l.source as Node).id,
        target: typeof l.target === "string" ? l.target : (l.target as Node).id,
      }));

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 600;

    // Compute degree for filtered nodes
    const degreeMap = new Map<string, number>();
    filteredNodes.forEach(n => degreeMap.set(n.id, 0));
    filteredLinks.forEach(l => {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;
      degreeMap.set(s, (degreeMap.get(s) ?? 0) + 1);
      degreeMap.set(t, (degreeMap.get(t) ?? 0) + 1);
    });

    // Node radius scales with degree: min 8, max 60 to show main/sub topics clearly
    const nodeRadius = (id: string) => {
      const deg = degreeMap.get(id) ?? 0;
      const base = settingNodeSize === "large" ? 14 : 8;
      const mult = settingNodeSize === "large" ? 10 : 7;
      return Math.max(base, Math.min(60, base + deg * mult));
    };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svgSelRef.current = svg;

    // ── Defs ───────────────────────────────────────────────────────
    const defs = svg.append("defs");

    // Arrow markers per type
    Object.entries(TYPE_COLORS).forEach(([type, color]) => {
      defs.append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color)
        .attr("opacity", 0.75);
    });

    // ── Zoom ───────────────────────────────────────────────────────
    const container = svg.append("g").attr("class", "container");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (event) => container.attr("transform", event.transform.toString()));
    zoomRef.current = zoom;
    svg.call(zoom).on("dblclick.zoom", null); // disable double click zoom
    svg.call(zoom.transform, d3.zoomIdentity);

    // ── Force simulation ───────────────────────────────────────────
    const simulation = d3.forceSimulation<Node>(filteredNodes)
      .force("link", d3.forceLink<Node, Link>(filteredLinks)
        .id(d => d.id)
        .distance(d => {
          const s = d.source as Node;
          const t = d.target as Node;
          const baseDist = settingTension === "loose" ? 280 : 180;
          return baseDist + nodeRadius(s.id) + nodeRadius(t.id);
        })
        .strength(0.4)
      )
      .force("charge", d3.forceManyBody().strength(-800))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.06))
      .force("y", d3.forceY(height / 2).strength(0.06))
      .force("collision", d3.forceCollide<Node>(d => nodeRadius(d.id) + 40))
      .alphaDecay(0.02)
      .velocityDecay(0.35);

    // ── Curved edges ───────────────────────────────────────────────
    const linkG = container.append("g").attr("class", "links");

    const linkPath = linkG.selectAll<SVGPathElement, Link>("path")
      .data(filteredLinks)
      .join("path")
      .attr("class", "edge-path")
      .attr("fill", "none")
      .attr("stroke", d => {
        const targetId = typeof d.target === "string" ? d.target : (d.target as any).id;
        const targetNode = filteredNodes.find(n => n.id === targetId);
        const type = targetNode?.type || "default";
        return TYPE_COLORS[type] || TYPE_COLORS.default;
      })
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.35)
      .attr("marker-end", d => {
        const targetId = typeof d.target === "string" ? d.target : (d.target as any).id;
        const targetNode = nodes.find(n => n.id === targetId);
        const type = targetNode?.type && TYPE_COLORS[targetNode.type] ? targetNode.type : "default";
        return `url(#arrow-${type})`;
      });

    // Edge labels — hidden by default, shown on hover
    const linkLabelG = container.append("g").attr("class", "link-labels").style("pointer-events", "none");

    const linkLabelGroup = linkLabelG.selectAll<SVGGElement, Link>("g")
      .data(filteredLinks)
      .join("g")
      .attr("opacity", settingEdgeLabels === "always" ? 1 : 0);

    linkLabelGroup.append("rect")
      .attr("rx", 5).attr("ry", 5)
      .attr("fill", "#1A1D27").attr("stroke", "#292D3E").attr("stroke-width", 1).attr("opacity", 0.9);

    linkLabelGroup.append("text")
      .attr("fill", "#94A3B8")
      .attr("font-size", "9px")
      .attr("font-family", "system-ui, sans-serif")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(d => d.relation);

    linkLabelGroup.each(function () {
      const g = d3.select(this);
      const textEl = g.select("text").node() as SVGTextElement | null;
      if (!textEl) return;
      const bbox = textEl.getBBox();
      g.select("rect")
        .attr("x", bbox.x - 5).attr("y", bbox.y - 3)
        .attr("width", bbox.width + 10).attr("height", bbox.height + 6);
    });

    // ── Nodes ──────────────────────────────────────────────────────
    const nodeG = container.append("g").attr("class", "nodes");

    const nodeGroup = nodeG.selectAll<SVGGElement, Node>("g")
      .data(filteredNodes)
      .join("g")
      .style("cursor", "grab")
      .call(
        d3.drag<SVGGElement, Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    // Outer ring (clean, flat border instead of glow)
    nodeGroup.append("circle")
      .attr("r", d => nodeRadius(d.id) + 4)
      .attr("fill", "none")
      .attr("stroke", d => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.5);

    // Main filled circle (flat, solid color)
    nodeGroup.append("circle")
      .attr("r", d => nodeRadius(d.id))
      .attr("fill", d => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("stroke", "#1A1D27")
      .attr("stroke-width", 2);

    // Show abbreviation only if the node is large enough (radius > 15)
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", d => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("font-size", d => nodeRadius(d.id) >= 35 ? "9px" : nodeRadius(d.id) >= 20 ? "8px" : "6px")
      .attr("font-family", "system-ui, sans-serif")
      .attr("font-weight", "700")
      .attr("letter-spacing", "0.04em")
      .attr("pointer-events", "none")
      .attr("class", "type-abbrev-text")
      .attr("opacity", settingNodeLabels === "always" ? 1 : 0)
      .style("transition", "opacity 0.2s ease")
      .text(d => nodeRadius(d.id) > 15 ? typeAbbrev(d.type) : "");

    // FIX: Node name label — now rendered with:
    //   - increased vertical offset (nodeRadius + 18px instead of +14px)
    //   - a semi-transparent background rect for readability on dense graphs
    //   - truncation for very long names (>20 chars) to prevent overlap
    const nameLabelGroup = nodeGroup.append("g")
      .attr("pointer-events", "none")
      .attr("class", "name-label-g")
      .attr("opacity", settingNodeLabels === "always" ? 1 : 0)
      .style("transition", "opacity 0.2s ease");

    // Background pill for name label
    nameLabelGroup.append("rect")
      .attr("rx", 4).attr("ry", 4)
      .attr("fill", "rgba(15,17,26,0.75)")
      .attr("height", 16)
      // width and x are set after text is measured, in a separate pass below
      .attr("class", "name-bg");

    nameLabelGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("fill", "#F8FAFC")
      .attr("font-size", d => {
        const len = d.id.length;
        return len > 16 ? "10px" : len > 10 ? "11px" : "12px";
      })
      .attr("font-family", "system-ui, sans-serif")
      .attr("font-weight", "600")
      .attr("letter-spacing", "0.02em")
      .attr("class", "name-text")
      // Text is positioned relative to the <g>, so we offset by radius here
      // and move the whole <g> each tick
      .text(d => {
        // Truncate names longer than 22 chars so they don't overlap neighbors
        const name = d.id;
        return name.length > 22 ? name.slice(0, 20) + "…" : name;
      });

    // ── Hover & Focus Interactions (State Only) ───────────────────
    nodeGroup
      .on("mouseenter", (_event, d) => {
        setHoveredNode({ id: d.id, type: d.type, degree: degreeMap.get(d.id) ?? 0 });
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick?.(d.id);
      });

    // ── Tick ───────────────────────────────────────────────────────
    simulation.on("tick", () => {
      // Quadratic bezier curve paths
      linkPath.attr("d", d => {
        const sx = (d.source as Node).x ?? 0;
        const sy = (d.source as Node).y ?? 0;
        const tx = (d.target as Node).x ?? 0;
        const ty = (d.target as Node).y ?? 0;
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = Math.min(40, len * 0.18);
        const cx = mx - (dy / len) * offset;
        const cy = my + (dx / len) * offset;

        const tr = nodeRadius(typeof d.target === "string" ? d.target : (d.target as Node).id) + 4;
        const tAngle = Math.atan2(ty - cy, tx - cx);
        const ex = tx - Math.cos(tAngle) * tr;
        const ey = ty - Math.sin(tAngle) * tr;

        return `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
      });

      linkLabelGroup.attr("transform", d => {
        const sx = (d.source as Node).x ?? 0;
        const sy = (d.source as Node).y ?? 0;
        const tx = (d.target as Node).x ?? 0;
        const ty = (d.target as Node).y ?? 0;
        return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`;
      });

      nodeGroup.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      // Position name label group below each node circle
      nodeGroup.each(function (d) {
        const r = nodeRadius(d.id);
        const labelOffset = r > 15 ? r + 18 : r + 10; // Closer offset for small nodes
        const g = d3.select(this).select<SVGGElement>("g.name-label-g");
        if (!g.empty()) {
          g.attr("transform", `translate(0, ${labelOffset})`);
        }
      });
    });

    // Assign class to nameLabelGroup so we can find it in tick (if not already assigned)
    nodeGroup.selectAll<SVGGElement, Node>("g.name-label-g")
      .attr("class", "name-label-g");

    // After initial render, size the background rect to match the text
    // (can't do this in join because text hasn't been rendered yet)
    setTimeout(() => {
      nodeGroup.each(function () {
        const g = d3.select(this);
        const textEl = g.select<SVGTextElement>(".name-text").node();
        const rectEl = g.select<SVGRectElement>(".name-bg");
        if (!textEl || rectEl.empty()) return;
        try {
          const bbox = textEl.getBBox();
          rectEl
            .attr("x", bbox.x - 4)
            .attr("y", bbox.y - 2)
            .attr("width", bbox.width + 8)
            .attr("height", bbox.height + 4);
        } catch { /* getBBox fails on hidden elements */ }
      });
    }, 100);

    // ── Animate in ─────────────────────────────────────────────────
    nodeGroup.attr("opacity", 0).transition().duration(500).attr("opacity", 1);
    linkPath.attr("opacity", 0).transition().duration(500).attr("opacity", 1);

    return () => { simulation.stop(); };
  }, [nodes, links, settingNodeSize, settingTension]);

  // ── Handle Visual State (Selection, Hover, Filters) ─────────────
  useEffect(() => {
    if (!svgSelRef.current) return;
    const svg = svgSelRef.current;

    // Calculate neighbors for hover
    const neighbors = new Set<string>();
    if (hoveredNode) {
      neighbors.add(hoveredNode.id);
      links.forEach(l => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id;
        const t = typeof l.target === "string" ? l.target : (l.target as any).id;
        if (s === hoveredNode.id) neighbors.add(t);
        if (t === hoveredNode.id) neighbors.add(s);
      });
    }

    // Nodes
    svg.selectAll<SVGGElement, Node>("g.nodes > g")
      .transition("visual").duration(250)
      .attr("opacity", n => {
        if (hoveredNode) return neighbors.has(n.id) ? 1 : 0.15;
        if (!selectedNodeId && !filterType) return 1;
        if (selectedNodeId && n.id === selectedNodeId) return 1;
        if (filterType && n.type === filterType) return 1;
        return 0.15;
      })
      .attr("filter", n => (selectedNodeId && n.id === selectedNodeId) ? "brightness(1.4)" : "none");

    // Links
    svg.selectAll<SVGPathElement, Link>("g.links path")
      .transition("visual").duration(250)
      .attr("stroke-opacity", l => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id;
        const t = typeof l.target === "string" ? l.target : (l.target as any).id;

        if (hoveredNode) return (s === hoveredNode.id || t === hoveredNode.id) ? 0.8 : 0.1;
        if (!selectedNodeId && !filterType) return 0.35;
        if (selectedNodeId && (s === selectedNodeId || t === selectedNodeId)) return 0.8;
        if (filterType && (nodes.find(n => n.id === s)?.type === filterType || nodes.find(n => n.id === t)?.type === filterType)) return 0.6;
        return 0.15;
      });

    // Node labels
    svg.selectAll<SVGElement, Node>(".name-label-g, .type-abbrev-text")
      .attr("opacity", n => {
        if (settingNodeLabels === "always") return 1;
        if (hoveredNode && neighbors.has(n.id)) return 1;
        if (selectedNodeId && n.id === selectedNodeId) return 1;
        return 0;
      });

    // Edge labels
    svg.selectAll<SVGElement, Link>("g.link-labels g")
      .attr("opacity", l => {
        if (settingEdgeLabels === "always") return 1;
        const s = typeof l.source === "string" ? l.source : (l.source as any).id;
        const t = typeof l.target === "string" ? l.target : (l.target as any).id;
        if (hoveredNode && (s === hoveredNode.id || t === hoveredNode.id)) return 1;
        if (selectedNodeId && (s === selectedNodeId || t === selectedNodeId)) return 1;
        return 0;
      });

  }, [selectedNodeId, filterType, hoveredNode, nodes, links, settingNodeLabels, settingEdgeLabels]);

  // ── Legend data ────────────────────────────────────────────────
  const usedTypes = [...new Set(nodes.map(n => n.type))].filter(t => TYPE_COLORS[t]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>

      {/* SVG canvas */}
      <svg ref={svgRef} style={{ width: "100%", height: "100%", background: "transparent" }} />

      {/* Zoom controls & Settings Toggle */}
      <div className="graph-controls">
        <button title="Zoom in" onClick={zoomIn} className="graph-btn">+</button>
        <button title="Zoom out" onClick={zoomOut} className="graph-btn">−</button>
        <button title="Reset zoom" onClick={zoomReset} className="graph-btn">⊙</button>
        <button
          title="Graph Settings"
          onClick={() => setShowSettings(!showSettings)}
          className={`graph-btn ${showSettings ? "active" : ""}`}
          style={{ marginTop: "8px" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>


      {/* Settings Panel */}
      {showSettings && (
        <div className="graph-settings-panel">
          <div className="settings-title">Graph Settings</div>

          <div className="settings-row">
            <span className="settings-label">Node Size</span>
            <select
              value={settingNodeSize}
              onChange={e => setSettingNodeSize(e.target.value as any)}
              className="settings-select"
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </div>

          <div className="settings-row">
            <span className="settings-label">Node Labels</span>
            <select
              value={settingNodeLabels}
              onChange={e => setSettingNodeLabels(e.target.value as any)}
              className="settings-select"
            >
              <option value="hover">On Hover</option>
              <option value="always">Always Show</option>
            </select>
          </div>

          <div className="settings-row">
            <span className="settings-label">Edge Facts</span>
            <select
              value={settingEdgeLabels}
              onChange={e => setSettingEdgeLabels(e.target.value as any)}
              className="settings-select"
            >
              <option value="hover">On Hover</option>
              <option value="always">Always Show</option>
            </select>
          </div>

          <div className="settings-row">
            <span className="settings-label">Physics Tension</span>
            <select
              value={settingTension}
              onChange={e => setSettingTension(e.target.value as any)}
              className="settings-select"
            >
              <option value="tight">Tight</option>
              <option value="loose">Loose</option>
            </select>
          </div>

        </div>
      )}


      {/* Legend — shows full type name with color dot */}
      {usedTypes.length > 0 && (
        <div className="graph-legend">
          <div className="graph-legend-title">Entity Types (Filter)</div>
          {usedTypes.map(type => (
            <div
              key={type}
              className={`graph-legend-item ${filterType === type ? "active" : ""}`}
              onClick={() => onFilterChange?.(filterType === type ? null : type)}
              style={{ cursor: "pointer", opacity: (!filterType || filterType === type) ? 1 : 0.4 }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: TYPE_COLORS[type] || TYPE_COLORS.default,
                boxShadow: `0 0 6px ${TYPE_COLORS[type] || TYPE_COLORS.default}`,
                flexShrink: 0,
              }} />
              <span className="graph-legend-text" style={{ color: filterType === type ? "var(--accent)" : "var(--text-muted)" }}>{type}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hover tooltip — shows full name, full type, degree */}
      {hoveredNode && (
        <div
          className="graph-tooltip"
          style={{
            border: `1px solid ${TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.default}`,
            boxShadow: `0 4px 20px ${TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.default}33`,
          }}
        >
          <div className="graph-tooltip-title">
            {hoveredNode.id}
          </div>
          <div className="graph-tooltip-type" style={{ color: TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.default }}>
            {hoveredNode.type}
          </div>
          <div className="graph-tooltip-meta">
            {hoveredNode.degree} connection{hoveredNode.degree !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
