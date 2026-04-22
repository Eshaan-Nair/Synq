import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface Node {
  id: string;
  type: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | Node;
  target: string | Node;
  relation: string;
}

interface Props {
  nodes: Node[];
  links: Link[];
}

const TYPE_COLORS: Record<string, string> = {
  Project:      "#FBDB93",
  Technology:   "#BE5B50",
  Feature:      "#c47a6e",
  Bug:          "#8A2D3B",
  Decision:     "#FBDB93",
  Auth:         "#BE5B50",
  Database:     "#8A2D3B",
  Library:      "#c49a6e",
  API:          "#BE5B50",
  Concept:      "#c47a6e",
  Property:     "#FBDB93",
  Framework:    "#BE5B50",
  Architecture: "#8A2D3B",
  Algorithm:    "#c47a6e",
  Encoding:     "#FBDB93",
  default:      "#7a4a52",
};

const NODE_RADIUS = 28;

export default function GraphView({ nodes, links }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 600;

    // Clear previous render
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // ── Defs: arrow markers + glow filter ──────────────────────────
    const defs = svg.append("defs");

    // Glow filter for nodes
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Arrow marker per color — one per type
    Object.entries(TYPE_COLORS).forEach(([type, color]) => {
      defs.append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", NODE_RADIUS + 10)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color)
        .attr("opacity", 0.7);
    });

    // ── Zoom + pan ──────────────────────────────────────────────────
    const container = svg.append("g").attr("class", "container");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    // ── Force simulation ────────────────────────────────────────────
    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links)
        .id((d) => d.id)
        .distance(160)
        .strength(0.5)
      )
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(NODE_RADIUS + 20))
      .alphaDecay(0.02) // slower decay = more animation
      .velocityDecay(0.3);

    // ── Draw edges ──────────────────────────────────────────────────
    const linkG = container.append("g").attr("class", "links");

    const linkLine = linkG.selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => {
        const target = d.target as Node;
        return TYPE_COLORS[target.type] || TYPE_COLORS.default;
      })
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.4)
      .attr("marker-end", (d) => {
        const target = d.target as Node;
        const type = target.type || "default";
        return `url(#arrow-${TYPE_COLORS[type] ? type : "default"})`;
      });

    // Edge label background + text group
    const linkLabelG = container.append("g").attr("class", "link-labels");

    const linkLabelGroup = linkLabelG.selectAll("g")
      .data(links)
      .join("g");

    // Background pill for edge label
    linkLabelGroup.append("rect")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "#1e1e2e")
      .attr("stroke", "#313244")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.85);

    const linkText = linkLabelGroup.append("text")
      .attr("fill", "#6c7086")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text((d) => d.relation);

    // Size the background rect after text is added
    linkLabelGroup.each(function () {
      const g = d3.select(this);
      const text = g.select("text").node() as SVGTextElement;
      if (!text) return;
      const bbox = text.getBBox();
      g.select("rect")
        .attr("x", bbox.x - 4)
        .attr("y", bbox.y - 2)
        .attr("width", bbox.width + 8)
        .attr("height", bbox.height + 4);
    });

    // ── Draw nodes ──────────────────────────────────────────────────
    const nodeG = container.append("g").attr("class", "nodes");

    const nodeGroup = nodeG.selectAll<SVGGElement, Node>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "grab")
      .call(
        d3.drag<SVGGElement, Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Outer glow ring
    nodeGroup.append("circle")
      .attr("r", NODE_RADIUS + 6)
      .attr("fill", "none")
      .attr("stroke", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.2)
      .attr("filter", "url(#glow)");

    // Main circle
    nodeGroup.append("circle")
      .attr("r", NODE_RADIUS)
      .attr("fill", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("fill-opacity", 0.12)
      .attr("stroke", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("stroke-width", 2)
      .attr("filter", "url(#glow)");

    // Node name — ABOVE the circle
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", -(NODE_RADIUS + 8))
      .attr("fill", "#cdd6f4")
      .attr("font-size", "11px")
      .attr("font-family", "monospace")
      .attr("font-weight", "bold")
      .attr("pointer-events", "none")
      .text((d) => d.id.length > 14 ? d.id.slice(0, 14) + "…" : d.id);

    // Type label — INSIDE the circle
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("font-size", "8px")
      .attr("font-family", "monospace")
      .attr("opacity", 0.9)
      .attr("pointer-events", "none")
      .text((d) => d.type);

    // ── Tick update ─────────────────────────────────────────────────
    simulation.on("tick", () => {
      linkLine
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!)
        .attr("y2", (d) => (d.target as Node).y!);

      // Position edge labels at midpoint
      linkLabelGroup.attr("transform", (d) => {
        const sx = (d.source as Node).x!;
        const sy = (d.source as Node).y!;
        const tx = (d.target as Node).x!;
        const ty = (d.target as Node).y!;
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        return `translate(${mx}, ${my})`;
      });

      nodeGroup.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // ── Legend ──────────────────────────────────────────────────────
    const legendTypes = [...new Set(nodes.map((n) => n.type))];
    const legendG = svg.append("g")
      .attr("transform", `translate(${width - 160}, ${height - legendTypes.length * 20 - 16})`);

    legendG.append("rect")
      .attr("x", -8)
      .attr("y", -8)
      .attr("width", 152)
      .attr("height", legendTypes.length * 20 + 16)
      .attr("fill", "#1e1e2e")
      .attr("stroke", "#313244")
      .attr("rx", 8)
      .attr("opacity", 0.9);

    legendTypes.forEach((type, i) => {
      const color = TYPE_COLORS[type] || TYPE_COLORS.default;
      const row = legendG.append("g")
        .attr("transform", `translate(0, ${i * 20})`);

      row.append("circle")
        .attr("r", 5)
        .attr("cx", 8)
        .attr("cy", 8)
        .attr("fill", color)
        .attr("fill-opacity", 0.3)
        .attr("stroke", color)
        .attr("stroke-width", 1.5);

      row.append("text")
        .attr("x", 20)
        .attr("y", 12)
        .attr("fill", "#a6adc8")
        .attr("font-size", "10px")
        .attr("font-family", "monospace")
        .text(type);
    });

    // ── Animate in nodes ────────────────────────────────────────────
    nodeGroup
      .attr("opacity", 0)
      .transition()
      .duration(400)
      .delay((_, i) => i * 40)
      .attr("opacity", 1);

    linkLine
      .attr("opacity", 0)
      .transition()
      .duration(400)
      .delay((_, i) => i * 30 + 200)
      .attr("opacity", 1);

    return () => simulation.stop();
  }, [nodes, links]);

  return (
    <svg
      ref={svgRef}
      style={{
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
    />
  );
}