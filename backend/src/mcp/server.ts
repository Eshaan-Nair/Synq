/**
 * mcp/server.ts — SYNQ MCP Server (stdio transport)
 *
 * Transforms SYNQ into a universal memory layer accessible from any
 * MCP-compatible AI tool: Claude Code, Cursor, Windsurf, Claude Desktop.
 *
 * Run: node backend/dist/mcp/server.js
 * Configure in your AI tool — see MCP_SETUP.md
 *
 * Five tools exposed:
 *   - recall_context      → retrieve relevant memory for a prompt
 *   - store_memory        → save text to SYNQ long-term memory
 *   - search_memory       → semantic search across all sessions
 *   - list_projects       → list all saved project names
 *   - get_project_summary → get knowledge graph summary for a project
 *
 * Updated: v1.4.1
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
import { connectMongo } from "../services/mongo";
import { connectChroma }from "../services/chroma";
import { connectNeo4j } from "../services/neo4j";

// ── Tool definitions ────────────────────────────────────────────────
const TOOLS = [
  {
    name: "recall_context",
    description:
      "Retrieve the most relevant memory chunks for a given prompt. " +
      "Call this at the start of any coding session to restore project context. " +
      "Returns sanitised chunks wrapped in <synq_retrieved_context> delimiters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt:  { type: "string",  description: "The current task or question" },
        project: { type: "string",  description: "Project name to scope the search (optional)" },
        topN:    { type: "number",  description: "Max chunks to return (default 3, max 6)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "store_memory",
    description:
      "Save text to SYNQ long-term memory. " +
      "Stores in ChromaDB (vector search) and Neo4j (knowledge graph). " +
      "Use after completing a task, making a decision, or discovering something important.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text:    { type: "string", description: "Content to save" },
        project: { type: "string", description: "Project to associate with" },
      },
      required: ["text"],
    },
  },
  {
    name: "search_memory",
    description:
      "Semantic search across all sessions and projects. " +
      "Unlike recall_context, this is not scoped to one session — it searches everything.",
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
    description: "List all project names stored in SYNQ memory.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_project_summary",
    description:
      "Get a structured knowledge-graph summary for a project. " +
      "Returns key decisions, technologies, and relationships extracted from past conversations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Project name" },
      },
      required: ["project"],
    },
  },
];

// ── Server setup ────────────────────────────────────────────────────
const server = new Server(
  { name: "synq-memory", version: "1.4.1" },
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
          args.project as string | undefined,
          args.topN as number | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }
      case "store_memory": {
        const result = await store(
          args.text as string,
          args.project as string | undefined
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

// ── Bootstrap: connect to DBs then start server ─────────────────────
async function main() {
  try {
    await connectMongo();
    await connectChroma();
    await connectNeo4j();
  } catch (err) {
    process.stderr.write(`[SYNQ MCP] DB connection warning: ${err}\n`);
    // Non-fatal — tools that need the DB will return errors individually
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[SYNQ MCP] Server ready — listening for tool calls via stdio\n");
}

main().catch(err => {
  process.stderr.write(`[SYNQ MCP] Fatal: ${err}\n`);
  process.exit(1);
});
