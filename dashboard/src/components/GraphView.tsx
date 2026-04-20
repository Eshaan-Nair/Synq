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
  Project:    "#6366f1",
  Technology: "#22d3ee",
  Feature:    "#a6e3a1",
  Bug:        "#f38ba8",
  Decision:   "#fab387",
  Auth:       "#cba6f7",
  Database:   "#89b4fa",
  Library:    "#f9e2af",
  API:        "#94e2d5",
  default:    "#6c7086",
};

export default function GraphView({ nodes, links }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // Fallback dimensions if SVG hasn't painted yet
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);

    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 24)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#6c7086");

    const container = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => {
          container.attr("transform", event.transform);
        })
    );

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links)
        .id((d) => d.id)
        .distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(40));

    const link = container.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#313244")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    const linkLabel = container.append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .attr("fill", "#6c7086")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .attr("text-anchor", "middle")
      .text((d) => d.relation);

    const node = container.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
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

    node.append("circle")
      .attr("r", 18)
      .attr("fill", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("fill-opacity", 0.15)
      .attr("stroke", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("stroke-width", 2);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#cdd6f4")
      .attr("font-size", "10px")
      .attr("font-family", "monospace")
      .text((d) => d.id.length > 12 ? d.id.slice(0, 12) + "…" : d.id);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "2.2em")
      .attr("fill", (d) => TYPE_COLORS[d.type] || TYPE_COLORS.default)
      .attr("font-size", "8px")
      .attr("font-family", "monospace")
      .text((d) => d.type);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!)
        .attr("y2", (d) => (d.target as Node).y!);

      linkLabel
        .attr("x", (d) => ((d.source as Node).x! + (d.target as Node).x!) / 2)
        .attr("y", (d) => ((d.source as Node).y! + (d.target as Node).y!) / 2);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [nodes, links]);

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    />
  );
}