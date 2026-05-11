/**
 * GraphView.tsx — v1.4.7
 * 
 * Performance Upgrade: Switched from SVG to HTML5 Canvas for rendering.
 * 
 * Why?
 * SVG creates thousands of DOM elements (1500 nodes + 3000 links = 4500+ elements).
 * Canvas uses a single draw call to render everything, allowing buttery smooth 
 * 60FPS even with massive graphs on low-end hardware.
 * 
 * Preserved Aesthetics:
 * - Quadratic Bezier curved edges.
 * - Degree-based node sizing.
 * - Technical-dark theme palette.
 * - Smooth hover/selection dimming.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  community?: number;
  firstSeen?: string;
  degree?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
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
}

// ── Design System ───────────────────────────────────────────────
const STATIC_TYPE_COLORS: Record<string, string> = {
  Person: "#F472B6", Pet: "#FB923C", Goal: "#34D399", Problem: "#F87171",
  Preference: "#818CF8", Habit: "#FCD34D", Location: "#2DD4BF",
  Organization: "#6366F1", Education: "#A78BFA", Project: "#94A3B8",
  Technology: "#8B5CF6", Feature: "#EC4899", Bug: "#EF4444",
  Decision: "#F59E0B", Auth: "#10B981", Database: "#06B6D4",
  Library: "#3B82F6", API: "#6366F1", Concept: "#D946EF",
  Framework: "#7C3AED", Architecture: "#EAB308", Tool: "#4ADE80",
  Pattern: "#2DD4BF", Algorithm: "#14B8A6", default: "#475569",
};

function getDynamicColor(type: string): string {
  if (!type) return STATIC_TYPE_COLORS.default;
  if (STATIC_TYPE_COLORS[type]) return STATIC_TYPE_COLORS[type];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
}

export const TYPE_COLORS = new Proxy(STATIC_TYPE_COLORS, {
  get: (target, prop) => (typeof prop !== "string" ? target["default"] : (target[prop] || getDynamicColor(prop)))
});

// Attach to window for the sidebar legend to access
if (typeof window !== "undefined") {
  (window as any).TYPE_COLORS = TYPE_COLORS;
}

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

export default function GraphView({ nodes, links, onNodeClick, selectedNodeId, filterType }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const transformRef = useRef(d3.zoomIdentity);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingNodeSize, setSettingNodeSize] = useState<"normal" | "large">("normal");
  const [settingNodeLabels, setSettingNodeLabels] = useState<"always" | "hover">("hover");
  const [settingEdgeLabels, setSettingEdgeLabels] = useState<"always" | "hover">("hover");
  const [settingTension, setSettingTension] = useState<"loose" | "tight">("loose");

  // Pre-process nodes with degree
  const processedData = useMemo(() => {
    const dMap = new Map<string, number>();
    nodes.forEach(n => dMap.set(n.id, 0));
    links.forEach(l => {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;
      dMap.set(s, (dMap.get(s) || 0) + 1);
      dMap.set(t, (dMap.get(t) || 0) + 1);
    });
    return {
      nodes: nodes.map(n => ({ ...n, degree: dMap.get(n.id) || 0 })),
      links: links.map(l => ({ ...l })),
      degreeMap: dMap
    };
  }, [nodes, links]);

  const getNodeRadius = (degree: number) => {
    const base = settingNodeSize === "large" ? 14 : 8;
    const mult = settingNodeSize === "large" ? 10 : 7;
    return Math.max(base, Math.min(60, base + (degree || 0) * mult));
  };

  // ── Simulation Lifecycle ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Custom wander force: nudges every node by a tiny random amount each tick
    // This keeps the graph "alive" without disrupting the layout
    const wanderStrength = 0.04;
    const wanderForce = () => {
      processedData.nodes.forEach((n: any) => {
        n.vx = (n.vx || 0) + (Math.random() - 0.5) * wanderStrength;
        n.vy = (n.vy || 0) + (Math.random() - 0.5) * wanderStrength;
      });
    };

    if (!simulationRef.current) {
      simulationRef.current = d3.forceSimulation<Node>(processedData.nodes)
        .force("link", d3.forceLink<Node, Link>(processedData.links)
          .id(d => d.id)
          .distance(d => {
            const baseDist = settingTension === "loose" ? 280 : 180;
            const s = d.source as Node;
            const t = d.target as Node;
            return baseDist + getNodeRadius(s.degree || 0) + getNodeRadius(t.degree || 0);
          })
          .strength(0.4)
        )
        .force("charge", d3.forceManyBody().strength(nodes.length > 500 ? -400 : -800))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(width / 2).strength(0.06))
        .force("y", d3.forceY(height / 2).strength(0.06))
        .force("collision", d3.forceCollide<Node>(d => getNodeRadius(d.degree || 0) + (nodes.length > 500 ? 10 : 40)))
        .force("wander", wanderForce)
        .alphaDecay(0.02)
        .alphaMin(0.001)     // Never fully freeze
        .alphaTarget(0.002)  // Keep a tiny constant energy level
        .velocityDecay(0.6); // High damping keeps movement slow & calm
    } else {
      simulationRef.current.nodes(processedData.nodes);
      (simulationRef.current.force("link") as d3.ForceLink<Node, Link>).links(processedData.links);
      simulationRef.current.force("wander", wanderForce);
      simulationRef.current.alpha(0.3).restart();
    }

    return () => {
      simulationRef.current?.stop();
    };
  }, [processedData, settingTension, settingNodeSize]);

  // ── Drawing & Interactions ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Handle High DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Build neighbor sets for hover AND selection highlighting
    const neighbors = new Set<string>();
    if (hoveredNodeId) {
      neighbors.add(hoveredNodeId);
      processedData.links.forEach(l => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id;
        const t = typeof l.target === "string" ? l.target : (l.target as any).id;
        if (s === hoveredNodeId) neighbors.add(t);
        if (t === hoveredNodeId) neighbors.add(s);
      });
    }

    const selectedNeighbors = new Set<string>();
    if (selectedNodeId) {
      selectedNeighbors.add(selectedNodeId);
      processedData.links.forEach(l => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id;
        const t = typeof l.target === "string" ? l.target : (l.target as any).id;
        if (s === selectedNodeId) selectedNeighbors.add(t);
        if (t === selectedNodeId) selectedNeighbors.add(s);
      });
    }

    // Throttle ambient redraws to ~24fps (wander is imperceptibly slow, 60fps is wasted)
    let frameCount = 0;

    const draw = () => {
      frameCount++;
      // Only redraw if there's interaction OR every 2nd frame for wander
      if (!hoveredNodeId && !selectedNodeId && !filterType && frameCount % 2 !== 0) return;

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.k, transformRef.current.k);


      // ── Draw Links (two passes: dimmed first, then bright) ──────
      // Pass 1: Dimmed links in one batch (minimises state changes)
      ctx.lineWidth = 1;
      processedData.links.forEach(l => {
        const s = l.source as Node;
        const t = l.target as Node;
        if (!s.x || !s.y || !t.x || !t.y) return;

        const isHovered = hoveredNodeId && (s.id === hoveredNodeId || t.id === hoveredNodeId);
        const isInSelectionFocus = selectedNodeId && (selectedNeighbors.has(s.id) && selectedNeighbors.has(t.id));
        const isTypeFiltered = filterType && (s.type !== filterType && t.type !== filterType);
        const isDimmed = (hoveredNodeId && !isHovered) ||
                         (!hoveredNodeId && selectedNodeId && !isInSelectionFocus) ||
                         (!hoveredNodeId && !selectedNodeId && isTypeFiltered);

        if (!isDimmed) return; // skip — drawn in pass 2

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y); // Straight line for dimmed — much cheaper
        ctx.strokeStyle = TYPE_COLORS[t.type] || TYPE_COLORS.default;
        ctx.globalAlpha = 0.03;
        ctx.stroke();
      });

      // Pass 2: Bright / interactive links
      processedData.links.forEach(l => {
        const s = l.source as Node;
        const t = l.target as Node;
        if (!s.x || !s.y || !t.x || !t.y) return;

        const isHovered = hoveredNodeId && (s.id === hoveredNodeId || t.id === hoveredNodeId);
        const isInSelectionFocus = selectedNodeId && (selectedNeighbors.has(s.id) && selectedNeighbors.has(t.id));
        const isTypeFiltered = filterType && (s.type !== filterType && t.type !== filterType);
        const isDimmed = (hoveredNodeId && !isHovered) ||
                         (!hoveredNodeId && selectedNodeId && !isInSelectionFocus) ||
                         (!hoveredNodeId && !selectedNodeId && isTypeFiltered);
        const isHighlighted = !selectedNodeId && filterType && (s.type === filterType || t.type === filterType);
        const isSelected = selectedNodeId && (s.id === selectedNodeId || t.id === selectedNodeId);

        if (isDimmed) return; // already drawn in pass 1

        const importance = ((s.degree || 0) + (t.degree || 0)) / 20;
        const alpha = isHovered ? 0.9 : isSelected ? 0.85 : isHighlighted ? 0.8 : Math.min(0.4, 0.15 + importance);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = TYPE_COLORS[t.type] || TYPE_COLORS.default;
        ctx.lineWidth = isHovered ? 2 : isSelected ? 2 : 1.2;

        ctx.beginPath();
        if (isHovered || isSelected) {
          // Curved only for interactive links — cheaper overall
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const offset = Math.min(30, len * 0.15);
          ctx.moveTo(s.x, s.y);
          ctx.quadraticCurveTo(mx - (dy / len) * offset, my + (dx / len) * offset, t.x, t.y);
        } else {
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
        }
        ctx.stroke();

        // Arrowhead only on hovered/selected links
        if (isHovered || isSelected) {
          const tAngle = Math.atan2(t.y - s.y, t.x - s.x);
          const nr = getNodeRadius((t as any).degree || 0) + 3;
          const ax = t.x - Math.cos(tAngle) * nr;
          const ay = t.y - Math.sin(tAngle) * nr;
          const arrowSize = 5;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrowSize * Math.cos(tAngle - Math.PI / 6), ay - arrowSize * Math.sin(tAngle - Math.PI / 6));
          ctx.lineTo(ax - arrowSize * Math.cos(tAngle + Math.PI / 6), ay - arrowSize * Math.sin(tAngle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }

        // Edge labels only when hovered
        if (settingEdgeLabels === "always" || (settingEdgeLabels === "hover" && isHovered)) {
          ctx.globalAlpha = 1;
          const lx = (s.x + t.x) / 2;
          const ly = (s.y + t.y) / 2;
          ctx.font = "9px system-ui";
          const textWidth = ctx.measureText(l.relation).width;
          ctx.fillStyle = "rgba(13, 15, 23, 0.95)";
          ctx.fillRect(lx - textWidth/2 - 4, ly - 7, textWidth + 8, 14);
          ctx.fillStyle = "#94A3B8";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(l.relation, lx, ly);
        }
      });

      // ── Draw Nodes ──────────────────────────────────────────────
      // Reset shadow — only apply to hovered/selected node
      ctx.shadowBlur = 0;

      processedData.nodes.forEach(n => {
        if (!n.x || !n.y) return;
        const r = getNodeRadius(n.degree || 0);
        const isHovered = hoveredNodeId === n.id || neighbors.has(n.id);
        const isInSelectionFocus = !selectedNodeId || selectedNeighbors.has(n.id);
        const isTypeMatch = !filterType || n.type === filterType;
        const isDimmed = (hoveredNodeId && !isHovered) ||
                         (!hoveredNodeId && selectedNodeId && !isInSelectionFocus) ||
                         (!hoveredNodeId && !selectedNodeId && filterType && !isTypeMatch);
        const isSelected = selectedNodeId === n.id;
        const color = TYPE_COLORS[n.type] || TYPE_COLORS.default;
        const isDirectlyFocused = isHovered || isSelected;

        ctx.globalAlpha = isDimmed ? 0.08 : 1;

        // Glow: ONLY on the single directly interacted node — prevents GPU overload
        if (isDirectlyFocused) {
          ctx.shadowBlur = isSelected ? 20 : 14;
          ctx.shadowColor = color;
        }

        // Main Circle — single arc draw per node
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Thin border only for hovered/selected (cheap stroke on 1 node)
        if (isDirectlyFocused) {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Inner core only on focused nodes (not 4500 times per frame)
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 0.38, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fill();
        }

        // Reset shadow after focused node
        if (isDirectlyFocused) ctx.shadowBlur = 0;

        // Abbreviation label (only on large nodes or hover)
        if (r > 15 && (settingNodeLabels === "always" || isHovered)) {
          ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.3)" : "#FFFFFF";
          ctx.font = `bold ${r >= 35 ? "10px" : r >= 20 ? "8px" : "6px"} system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = isDimmed ? 0.1 : 0.9;
          ctx.fillText(typeAbbrev(n.type), n.x, n.y);
        }

        // Name label
        if (settingNodeLabels === "always" || isHovered || isSelected) {
          ctx.globalAlpha = 1;
          const labelOffset = r + 14;
          const displayName = n.id.length > 22 ? n.id.slice(0, 20) + "…" : n.id;
          const fontSize = n.id.length > 16 ? 10 : n.id.length > 10 ? 11 : 12;
          ctx.font = `600 ${fontSize}px system-ui`;
          const textWidth = ctx.measureText(displayName).width;
          ctx.fillStyle = "rgba(10, 12, 20, 0.85)";
          ctx.beginPath();
          ctx.roundRect(n.x - textWidth/2 - 6, n.y + labelOffset - 9, textWidth + 12, 18, 4);
          ctx.fill();
          ctx.fillStyle = "#F8FAFC";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(displayName, n.x, n.y + labelOffset);
        }
      });

      ctx.restore();
    };

    simulationRef.current?.on("tick", draw);

    // ── Interaction Handlers ─────────────────────────────────────
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        draw();
      });

    zoomRef.current = zoom;
    d3.select(canvas).call(zoom).on("dblclick.zoom", null);

    const findNodeAt = (x: number, y: number) => {
      const inv = transformRef.current.invert([x, y]);
      return simulationRef.current?.find(inv[0], inv[1], 40);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node?.id !== hoveredNodeId) {
        setHoveredNodeId(node?.id || null);
      }
      canvas.style.cursor = node ? "pointer" : "default";
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      onNodeClick?.(node?.id || null);
    };

    const drag = d3.drag<HTMLCanvasElement, unknown>()
      .subject((event) => {
        const rect = canvas.getBoundingClientRect();
        return findNodeAt(event.x - rect.left, event.y - rect.top);
      })
      .on("start", (event) => {
        if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on("drag", (event) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on("end", (event) => {
        if (!event.active) simulationRef.current?.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      });

    d3.select(canvas).call(drag as any);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleClick);

    // Force initial draw if simulation is already converged
    draw();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
    };
  }, [processedData, settingNodeSize, settingTension, hoveredNodeId, selectedNodeId, settingNodeLabels, settingEdgeLabels, filterType]);

  // Legend data
  const hoveredNode = useMemo(() => nodes.find(n => n.id === hoveredNodeId), [nodes, hoveredNodeId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

      <div className="graph-controls">
        <button title="Zoom in" onClick={() => {
          const canvas = canvasRef.current;
          if (!canvas || !zoomRef.current) return;
          d3.select(canvas).transition().duration(300).call(zoomRef.current.scaleBy, 1.5);
        }} className="graph-btn">+</button>
        <button title="Zoom out" onClick={() => {
          const canvas = canvasRef.current;
          if (!canvas || !zoomRef.current) return;
          d3.select(canvas).transition().duration(300).call(zoomRef.current.scaleBy, 0.67);
        }} className="graph-btn">−</button>
        <button title="Reset zoom" onClick={() => {
          const canvas = canvasRef.current;
          if (!canvas || !zoomRef.current) return;
          d3.select(canvas).transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity);
        }} className="graph-btn">⊙</button>
        <button
          title="Graph Settings"
          onClick={() => setShowSettings(!showSettings)}
          className={`graph-btn ${showSettings ? "active" : ""}`}
          style={{ marginTop: "8px" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>

      {showSettings && (
        <div className="graph-settings-panel">
          <div className="settings-title">Graph Settings</div>
          <div className="settings-row">
            <span className="settings-label">Node Size</span>
            <select value={settingNodeSize} onChange={e => setSettingNodeSize(e.target.value as any)} className="settings-select">
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-label">Node Labels</span>
            <select value={settingNodeLabels} onChange={e => setSettingNodeLabels(e.target.value as any)} className="settings-select">
              <option value="hover">On Hover</option>
              <option value="always">Always Show</option>
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-label">Edge Facts</span>
            <select value={settingEdgeLabels} onChange={e => setSettingEdgeLabels(e.target.value as any)} className="settings-select">
              <option value="hover">On Hover</option>
              <option value="always">Always Show</option>
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-label">Physics Tension</span>
            <select value={settingTension} onChange={e => setSettingTension(e.target.value as any)} className="settings-select">
              <option value="tight">Tight</option>
              <option value="loose">Loose</option>
            </select>
          </div>
        </div>
      )}


      {hoveredNode && (
        <div className="graph-tooltip" style={{ border: `1px solid ${TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.default}`, boxShadow: `0 4px 20px ${TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.default}33` }}>
          <div className="graph-tooltip-title">{hoveredNode.id}</div>
          <div className="graph-tooltip-type" style={{ color: TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.default }}>{hoveredNode.type}</div>
          <div className="graph-tooltip-meta">{(hoveredNode as any).degree} connection{(hoveredNode as any).degree !== 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}
