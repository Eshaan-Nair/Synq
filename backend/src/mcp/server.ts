/**
 * mcp/server.ts — SYNQ MCP Server (stdio transport)
 *
 * Transforms SYNQ into a universal memory layer accessible from any
 * MCP-compatible AI tool: Claude Code, Cursor, Windsurf, Claude Desktop.
 *
 * Five tools exposed:
 *   - recall_context      → retrieve relevant memory for a prompt
 *   - store_memory        → save text to SYNQ long-term memory
 *   - search_memory       → semantic search across all sessions
 *   - list_projects       → list all saved project names
 *   - get_project_summary → get knowledge graph summary for a project
 *
 * Updated: v1.4.2
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import path from "path";

// Load env — try both common locations
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../backend/.env") });

import { recall }       from "./tools/recall";
import { store }        from "./tools/store";
import { search }       from "./tools/search";
import { listProjects } from "./tools/projects";
import { getSummary }   from "./tools/summary";
import { logger }       from "../utils/logger";

// ── Tool definitions ────────────────────────────────────────────────
const TOOLS = [
  {
    name: "recall_context",
    description:
      "Retrieve the most relevant memory chunks for a given prompt. " +
      "Returns sanitised chunks wrapped in <synq_retrieved_context> delimiters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt:  { type: "string",  description: "The current task or question" },
        project: { type: "string",  description: "Project ID to scope the search (optional)" },
        topN:    { type: "number",  description: "Max chunks to return (default 3, max 6)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "store_memory",
    description:
      "Save text to SYNQ long-term memory. Stores in vector search and knowledge graph. " +
      "Use after completing a task, making a decision, or discovering something important.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text:    { type: "string", description: "Content to save" },
        project: { type: "string", description: "Project ID to associate with" },
      },
      required: ["text", "project"],
    },
  },
  {
    name: "search_memory",
    description:
      "Semantic search across all sessions and projects.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search query" },
        topN:  { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_projects",
    description: "List all project names and IDs stored in SYNQ memory.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_project_summary",
    description:
      "Get a structured knowledge-graph summary for a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Project ID" },
      },
      required: ["project"],
    },
  },
];

// ── Server setup ────────────────────────────────────────────────────
const server = new Server(
  { name: "synq-memory", version: "1.4.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case "recall_context": {
        const result = await recall(
          args.prompt as string,
          args.project as string,
          args.topN as number | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }
      case "store_memory": {
        const result = await store(
          args.text as string,
          args.project as string
        );
        return { content: [{ type: "text", text: result }] };
      }
      case "search_memory": {
        const result = await search(
          args.query as string,
          args.topN as number | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }
      case "list_projects": {
        const result = await listProjects();
        return { content: [{ type: "text", text: result }] };
      }
      case "get_project_summary": {
        const result = await getSummary(args.project as string);
        return { content: [{ type: "text", text: result }] };
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message ?? String(err)}` }],
      isError: true,
    };
  }
});

// ── Bootstrap: start server ─────────────────────
async function main() {
  const STORAGE_MODE = (process.env.SYNQ_STORAGE_MODE || "docker").toLowerCase();
  
  if (STORAGE_MODE === "docker") {
    const { connectMongo } = require("../services/mongo");
    const { connectChroma } = require("../services/chroma");
    const { connectNeo4j } = require("../services/neo4j");
    try {
      await connectMongo();
      await connectChroma();
      await connectNeo4j();
    } catch (err) {
      process.stderr.write(`[SYNQ MCP] Docker DB connection warning: ${err}\n`);
    }
  } else {
    const { initSqlite } = require("../services/sqlite");
    initSqlite();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[SYNQ MCP] Server ready (Mode: ${STORAGE_MODE.toUpperCase()}) — listening via stdio\n`);
}

main().catch(err => {
  process.stderr.write(`[SYNQ MCP] Fatal: ${err}\n`);
  process.exit(1);
});
