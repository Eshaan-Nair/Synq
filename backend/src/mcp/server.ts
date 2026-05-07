import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger";
import { sessionStore } from "../services/storage";

// Import tool handlers
import { listProjects } from "./tools/projects";
import { recallContext } from "./tools/recall";
import { searchMemory } from "./tools/search";
import { storeMemory } from "./tools/store";
import { getProjectSummary } from "./tools/summary";

const server = new Server(
  {
    name: "synq",
    version: "1.4.2",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "List all Synq projects/sessions.",
      },
      {
        name: "recall_context",
        description: "Retrieve relevant context from a specific Synq project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            query: { type: "string" },
            topN: { type: "number", default: 5 },
          },
          required: ["projectId", "query"],
        },
      },
      {
        name: "search_memory",
        description: "Search across all Synq projects using semantic search.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            topN: { type: "number", default: 5 },
          },
          required: ["query"],
        },
      },
      {
        name: "store_memory",
        description: "Manually ingest information into a Synq project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            text: { type: "string" },
          },
          required: ["projectId", "text"],
        },
      },
      {
        name: "get_project_summary",
        description: "Get a structured knowledge summary of a Synq project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
          },
          required: ["projectId"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_projects":
        return { content: [{ type: "text", text: await listProjects() }] };
      case "recall_context":
        return { content: [{ type: "text", text: await recallContext(args?.projectId as string, args?.query as string, args?.topN as number) }] };
      case "search_memory":
        return { content: [{ type: "text", text: await searchMemory(args?.query as string, args?.topN as number) }] };
      case "store_memory":
        return { content: [{ type: "text", text: await storeMemory(args?.projectId as string, args?.text as string) }] };
      case "get_project_summary":
        return { content: [{ type: "text", text: await getProjectSummary(args?.projectId as string) }] };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server using stdio transport.
 */
export async function startMcpServer() {
  const transport = new StdioServerTransport();
  
  // Initialization logic for SQLite mode if needed
  const STORAGE_MODE = (process.env.SYNQ_STORAGE_MODE || "docker").toLowerCase();
  if (STORAGE_MODE === "sqlite") {
    const { initSqlite } = require("../services/sqlite");
    initSqlite();
  }

  await server.connect(transport);
  logger.info("Synq MCP Server started.");
}
