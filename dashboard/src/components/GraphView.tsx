/**
 * GraphView.tsx — v1.5.1
 * 
 * Performance Upgrade: HTML5 Canvas for rendering.
 * Optimized draw loop and interaction handlers.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as d3 from "d3";
import type { Node, Link } from "../types";
import { TYPE_COLORS } from "../constants";

interface Props {
  nodes: Node[];
  links: Link[];
  onNodeClick?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
  filterType?: string | null;
  minDegree: number;
  setMinDegree: (val: number) => void;
}

const ABBREVIATIONS: Record<string, string> = {
  Person: "PER", Pet: "PET", Goal: "GOAL", Problem: "PROB",
  Preference: "PREF", Habit: "HABIT", Location: "LOC",
  Organization: "ORG", Project: "PROJ", Technology: "TECH",
  Feature: "FEAT", Bug: "BUG", Decision: "DEC", Auth: "AUTH",
  Database: "DB", Library: "LIB", API: "API", Concept: "CON",
  Framework: "FW", Architecture: "ARCH", Tool: "TOOL",
  Pattern: "PAT", Algorithm: "ALGO",
};

function getAbbreviation(type: string | null | undefined): string {
  if (!type) return "";
  return ABBREVIATIONS[type] || type.slice(0, 4).toUpperCase();
}

export default function GraphView({ 
  nodes, 
  links, 
  onNodeClick, 
  selectedNodeId, 
  filterType,
  minDegree,
  setMinDegree
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const transformRef = useRef(d3.zoomIdentity);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);

  const processedData = useMemo(() => {
    const degreeMap = new Map<string, number>();
    const posMap = new Map<string, { x?: number, y?: number, vx?: number, vy?: number }>();
    
    if (simulationRef.current) {
      simulationRef.current.nodes().forEach(node => {
        posMap.set(node.id, { x: node.x, y: node.y, vx: node.vx, vy: node.vy });
      });
    }

    nodes.forEach(node => degreeMap.set(node.id, 0));
    links.forEach(link => {
      const sourceId = typeof link.source === "string" ? link.source : (link.source as any).id;
      const targetId = typeof link.target === "string" ? link.target : (link.target as any).id;
      degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
      degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
    });

    return {
      nodes: nodes.map(node => {
        const pos = posMap.get(node.id);
        const degree = degreeMap.get(node.id) || 0;
        return { 
          ...node, 
          degree,
          x: pos?.x, 
          y: pos?.y, 
          vx: pos?.vx, 
          vy: pos?.vy,
          hidden: degree < minDegree
        };
      }),
      links: links.map(link => {
        const s = typeof link.source === "string" ? link.source : (link.source as any).id;
        const t = typeof link.target === "string" ? link.target : (link.target as any).id;
        const sDegree = degreeMap.get(s) || 0;
        const tDegree = degreeMap.get(t) || 0;
        return { 
          ...link,
          hidden: sDegree < minDegree || tDegree < minDegree
        };
      }),
      degreeMap
    };
  }, [nodes, links, minDegree]);

  const getNodeRadius = useCallback((degree: number) => {
    const base = 8;
    const mult = 7;
    return Math.max(base, Math.min(60, base + (degree || 0) * mult));
  }, []);



  // ── Simulation Lifecycle ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const wanderStrength = 0.08;
    const wanderForce = () => {
      processedData.nodes.forEach((node: any) => {
        node.vx = (node.vx || 0) + (Math.random() - 0.5) * wanderStrength;
        node.vy = (node.vy || 0) + (Math.random() - 0.5) * wanderStrength;
      });
    };

    const visibleNodes = processedData.nodes.filter(n => !n.hidden);
    const visibleLinks = processedData.links.filter(l => !l.hidden);

    if (!simulationRef.current) {
      simulationRef.current = d3.forceSimulation<Node>(visibleNodes)
        .force("link", d3.forceLink<Node, Link>(visibleLinks)
          .id(d => d.id)
          .distance(link => {
            const baseDist = 200;
            const s = link.source as Node;
            const t = link.target as Node;
            return baseDist + getNodeRadius(s.degree || 0) + getNodeRadius(t.degree || 0);
          })
          .strength(0.4)
        )
        .force("charge", d3.forceManyBody().strength(visibleNodes.length > 500 ? -400 : -800))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("radial", d3.forceRadial(0, width / 2, height / 2).strength(0.015))
        .force("x", d3.forceX(width / 2).strength(d => (d as any).degree === 0 ? 0.25 : 0.12))
        .force("y", d3.forceY(height / 2).strength(d => (d as any).degree === 0 ? 0.25 : 0.12))
        .force("collision", d3.forceCollide<Node>(d => getNodeRadius(d.degree || 0) + (visibleNodes.length > 500 ? 10 : 35)))
        .force("wander", wanderForce)
        .alphaDecay(0.05)
        .alphaMin(0.001)
        .alphaTarget(0.002)
        .velocityDecay(0.45);
    } else {
      const prevNodes = simulationRef.current.nodes();
      const hasChanged = prevNodes.length !== visibleNodes.length || 
                         (simulationRef.current.force("link") as any).links().length !== visibleLinks.length;

      simulationRef.current.nodes(visibleNodes);
      (simulationRef.current.force("link") as d3.ForceLink<Node, Link>).links(visibleLinks);
      simulationRef.current.force("radial", d3.forceRadial(0, width / 2, height / 2).strength(0.015));
      simulationRef.current.force("x", d3.forceX(width / 2).strength(d => (d as any).degree === 0 ? 0.25 : 0.12));
      simulationRef.current.force("y", d3.forceY(height / 2).strength(d => (d as any).degree === 0 ? 0.25 : 0.12));
      simulationRef.current.force("wander", wanderForce);
      
      if (hasChanged) {
        simulationRef.current.alpha(0.2).restart();
      }
    }

    return () => {
      simulationRef.current?.stop();
    };
  }, [processedData, getNodeRadius, minDegree]);

  // ── Drawing & Interactions ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const neighbors = new Set<string>();
    if (hoveredNodeId) {
      neighbors.add(hoveredNodeId);
      processedData.links.forEach(link => {
        const s = typeof link.source === "string" ? link.source : (link.source as any).id;
        const t = typeof link.target === "string" ? link.target : (link.target as any).id;
        if (s === hoveredNodeId) neighbors.add(t);
        if (t === hoveredNodeId) neighbors.add(s);
      });
    }

    const selectedNeighbors = new Set<string>();
    if (selectedNodeId) {
      selectedNeighbors.add(selectedNodeId);
      processedData.links.forEach(link => {
        if ((link as any).hidden) return;
        const s = typeof link.source === "string" ? link.source : (link.source as any).id;
        const t = typeof link.target === "string" ? link.target : (link.target as any).id;
        if (s === selectedNodeId) selectedNeighbors.add(t);
        if (t === selectedNodeId) selectedNeighbors.add(s);
      });
    }

    let frameCount = 0;

    const draw = () => {
      frameCount++;
      if (!hoveredNodeId && !selectedNodeId && !filterType && frameCount % 2 !== 0) return;

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.k, transformRef.current.k);

      // Links Pass 1: Dimmed
      ctx.lineWidth = 1;
      processedData.links.forEach(link => {
        const s = link.source as Node;
        const t = link.target as Node;
        if (!s.x || !s.y || !t.x || !t.y) return;

        const isInSelectionFocus = selectedNodeId && (selectedNeighbors.has(s.id) && selectedNeighbors.has(t.id));
        const isTypeFiltered = filterType && (s.type !== filterType && t.type !== filterType);
        const isDimmed = (selectedNodeId && !isInSelectionFocus) || (!selectedNodeId && isTypeFiltered);

        if (!isDimmed) return;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = TYPE_COLORS[t.type];
        ctx.globalAlpha = 0.03;
        ctx.stroke();
      });

      // Links Pass 2: Bright
      processedData.links.forEach(link => {
        if ((link as any).hidden) return;
        const s = link.source as Node;
        const t = link.target as Node;
        if (!s.x || !s.y || !t.x || !t.y) return;

        const isHovered = hoveredNodeId && (s.id === hoveredNodeId || t.id === hoveredNodeId);
        const isInSelectionFocus = selectedNodeId && (selectedNeighbors.has(s.id) && selectedNeighbors.has(t.id));
        const isTypeFiltered = filterType && (s.type !== filterType && t.type !== filterType);
        const isDimmed = (selectedNodeId && !isInSelectionFocus) || (!selectedNodeId && isTypeFiltered);
        const isHighlighted = !selectedNodeId && filterType && (s.type === filterType || t.type === filterType);
        const isSelected = selectedNodeId && (s.id === selectedNodeId || t.id === selectedNodeId);

        if (isDimmed) return;

        const importance = ((s.degree || 0) + (t.degree || 0)) / 20;
        const alpha = isHovered ? 0.9 : isSelected ? 0.85 : isHighlighted ? 0.8 : Math.min(0.4, 0.15 + importance);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = TYPE_COLORS[t.type];
        ctx.lineWidth = isHovered ? 2 : isSelected ? 2 : 1.2;

        ctx.beginPath();
        if (isHovered || isSelected) {
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

        if (isSelected) {
          ctx.globalAlpha = 1;
          const lx = (s.x + t.x) / 2;
          const ly = (s.y + t.y) / 2;
          ctx.font = "9px system-ui";
          const textWidth = ctx.measureText(link.relation).width;
          ctx.fillStyle = "rgba(13, 15, 23, 0.95)";
          ctx.fillRect(lx - textWidth/2 - 4, ly - 7, textWidth + 8, 14);
          ctx.fillStyle = "#94A3B8";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(link.relation, lx, ly);
        }
      });

      // Nodes
      ctx.shadowBlur = 0;
      processedData.nodes.forEach(node => {
        if (!node.x || !node.y || (node as any).hidden) return;
        const r = getNodeRadius(node.degree || 0);
        const isHovered = hoveredNodeId === node.id || neighbors.has(node.id);
        const isInSelectionFocus = !selectedNodeId || selectedNeighbors.has(node.id);
        const isTypeMatch = !filterType || node.type === filterType;
        const isDimmed = (selectedNodeId && !isInSelectionFocus) || (!selectedNodeId && filterType && !isTypeMatch);
        const isSelected = selectedNodeId === node.id;
        const color = TYPE_COLORS[node.type];
        const isDirectlyFocused = isHovered || isSelected;

        ctx.globalAlpha = isDimmed ? 0.08 : 1;

        if (isDirectlyFocused) {
          ctx.shadowBlur = isSelected ? 20 : 14;
          ctx.shadowColor = color;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        if (isDirectlyFocused) {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 0.38, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fill();
        }

        if (isDirectlyFocused) ctx.shadowBlur = 0;

        if (r > 15 && isHovered) {
          ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.3)" : "#FFFFFF";
          ctx.font = `bold ${r >= 35 ? "10px" : r >= 20 ? "8px" : "6px"} system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = isDimmed ? 0.1 : 0.9;
          ctx.fillText(getAbbreviation(node.type), node.x, node.y);
        }

        if (isSelected || selectedNeighbors.has(node.id)) {
          ctx.globalAlpha = 1;
          const labelOffset = r + 14;
          const displayName = node.id.length > 22 ? node.id.slice(0, 20) + "…" : node.id;
          const fontSize = node.id.length > 16 ? 10 : node.id.length > 10 ? 11 : 12;
          ctx.font = `600 ${fontSize}px system-ui`;
          const textWidth = ctx.measureText(displayName).width;
          ctx.fillStyle = "rgba(10, 12, 20, 0.85)";
          ctx.beginPath();
          ctx.roundRect(node.x - textWidth/2 - 6, node.y + labelOffset - 9, textWidth + 12, 18, 4);
          ctx.fill();
          ctx.fillStyle = "#F8FAFC";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(displayName, node.x, node.y + labelOffset);
        }
      });

      ctx.restore();
    };

    simulationRef.current?.on("tick", draw);

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
      if (node && node.id === selectedNodeId) {
        onNodeClick?.(null);
      } else {
        onNodeClick?.(node?.id || null);
      }
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

    draw();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
    };
  }, [processedData, getNodeRadius, hoveredNodeId, selectedNodeId, filterType]);

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
        }} className="graph-btn">⟲</button>
        <button title="Settings" onClick={() => setShowSettings(!showSettings)} className={`graph-btn ${showSettings ? "active" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>

      {showSettings && (
        <div className="graph-settings-panel">
          <div className="settings-title">Graph Density</div>
          <div className="settings-row">
            <div className="settings-label">Min Connections: {minDegree}</div>
            <input 
              type="range" 
              min="0" 
              max="5" 
              value={minDegree} 
              onChange={(e) => setMinDegree(parseInt(e.target.value))}
              style={{ accentColor: "var(--primary)" }}
            />
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Hiding nodes with fewer than {minDegree} connections.
          </div>
        </div>
      )}

      {hoveredNode && (
        <div className="graph-tooltip" style={{ border: `1px solid ${TYPE_COLORS[hoveredNode.type]}`, boxShadow: `0 4px 20px ${TYPE_COLORS[hoveredNode.type]}33` }}>
          <div className="graph-tooltip-title">{hoveredNode.id}</div>
          <div className="graph-tooltip-type" style={{ color: TYPE_COLORS[hoveredNode.type] }}>{hoveredNode.type}</div>
          <div className="graph-tooltip-meta">{(hoveredNode as any).degree} connection{(hoveredNode as any).degree !== 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}
