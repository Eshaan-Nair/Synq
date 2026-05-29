/**
 * mcp/server.ts — ArcRift MCP Server (stdio transport)
 *
 * Transforms ArcRift into a universal memory layer accessible from any
 * MCP-compatible AI tool: Claude Code, Cursor, Windsurf, Claude Desktop.
 *
 * Five tools exposed:
 *   - recall_context      → retrieve relevant memory for a prompt
 *   - store_memory        → save text to ArcRift long-term memory
 *   - search_memory       → semantic search across all sessions
 *   - list_projects       → list all saved project names
 *   - get_project_summary → get knowledge graph summary for a project
 *
 * Updated: v1.5.4
 */
process.env.ARCRIFT_MCP_MODE = "true";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import path from "path";

// Load env — try common locations relative to dist/src/mcp
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../backend/.env") });

import { recall } from "./tools/recall";
import { store } from "./tools/store";
import { prune } from "./tools/prune";
import { search } from "./tools/search";
import { listProjects } from "./tools/projects";
import { getSummary } from "./tools/summary";
import { identifyProject } from "./tools/detector";
import { initStorage, sessionStore } from "../services/storage";
import { logger } from "../utils/logger";

// ── Tool definitions ────────────────────────────────────────────────
const TOOLS = [
  {
    name: "recall_context",
    description:
      "Retrieve the most relevant memory chunks for a given prompt. " +
      "Returns sanitised chunks wrapped in <ARCRIFT_retrieved_context> delimiters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "The current task or question" },
        project: { type: "string", description: "Project ID to scope the search (optional)" },
        topN: { type: "number", description: "Max chunks to return (default 3, max 6)" },
        debug: { type: "boolean", description: "Include engine attribution in results (default false)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "store_memory",
    description:
      "Save text or a full conversation transcript to ArcRift long-term memory. " +
      "This updates the Knowledge Graph and makes the chat visible in the Dashboard history. " +
      "Use this to 'save' a coding session or a key decision.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The fact, decision, or context to remember" },
        project: { type: "string", description: "Project ID or a NEW project name (auto-creates)" },
      },
      required: ["content", "project"],
    },
  },
  {
    name: "prune_memory",
    description:
      "Surgically remove facts or context chunks from a project. " +
      "Use this to correct errors or tell ArcRift to 'forget' outdated info.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "What information should be removed?" },
        project: { type: "string", description: "Project ID to prune from" },
      },
      required: ["prompt", "project"],
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
        topN: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_projects",
    description: "List all project names and IDs stored in ArcRift Memory.",
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
  {
    name: "identify_active_project",
    description: "Automatically identify the ArcRift project ID based on a folder path or CWD.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "The current working directory or folder path" },
      },
      required: ["path"],
    },
  },
];

// ── Server setup ────────────────────────────────────────────────────
const server = new Server(
  { name: "ArcRift-memory", version: "1.5.4" },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// ── Resource handlers ──────────────────────────────────────────────
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const sessions = await sessionStore.getSessions();
  return {
    resources: sessions.map(s => ({
      uri: `ArcRift://projects/${s._id}/graph`,
      name: `${s.projectName} Knowledge Graph`,
      mimeType: "text/markdown",
      description: `Structured knowledge graph facts for ${s.projectName}`
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = new URL(req.params.uri);
  const match = uri.pathname.match(/\/projects\/([^/]+)\/graph/);

  if (!match) {
    throw new Error(`Invalid resource URI: ${req.params.uri}`);
  }

  const projectId = match[1];
  const summary = await getSummary(projectId);

  return {
    contents: [{
      uri: req.params.uri,
      mimeType: "text/markdown",
      text: summary
    }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case "recall_context": {
        const result = await recall(
          args.prompt as string,
          args.project as string,
          args.topN as number | undefined,
          args.debug as boolean | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }
      case "store_memory": {
        const result = await store(
          args.content as string,
          args.project as string
        );
        return { content: [{ type: "text", text: result }] };
      }
      case "prune_memory": {
        const result = await prune(
          args.prompt as string,
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
      case "identify_active_project": {
        const result = await identifyProject(args.path as string);
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
import { startWorker } from "../services/jobs";

async function main() {
  await initStorage();
  // Start the background worker so that sentence indexing jobs are processed
  startWorker().catch(err => logger.error("Failed to start job worker:", err));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("ArcRift MCP Server running on stdio");
}

main().catch(err => {
  process.stderr.write(`[ArcRift MCP] Fatal: ${err}\n`);
  process.exit(1);
});
