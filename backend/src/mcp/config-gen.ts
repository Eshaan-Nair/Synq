/**
 * mcp/config-gen.ts — MCP Configuration Generator
 * 
 * Automatically detects absolute paths and generates the JSON config
 * needed for Claude Code, Cursor, and other MCP clients.
 */

import path from "path";
import fs from "fs";

function generateConfig() {
  const rootDir = path.resolve(__dirname, "../../..");
  const backendDir = path.resolve(__dirname, "../..");
  const serverJs = path.join(backendDir, "dist", "mcp", "server.js");
  const dbPath = path.join(rootDir, "glia.db");
  const envPath = path.join(backendDir, ".env");

  console.log("\n--- GLIA MCP CONFIGURATION GENERATOR ---");
  console.log("Detected Paths:");
  console.log(`- Server executable: ${serverJs}`);
  console.log(`- Database file:     ${dbPath}`);
  console.log("");

  if (!fs.existsSync(path.join(backendDir, "dist"))) {
    console.warn("WARNING: 'dist' folder not found. Did you run 'npm run build' in the backend?");
  }

  const config = {
    glia: {
      command: "node",
      args: [serverJs],
      env: {
        GLIA_STORAGE_MODE: "sqlite",
        SQLITE_DB_PATH: dbPath,
        NODE_ENV: "production"
      }
    }
  };

  console.log("PASTE THIS INTO YOUR CONFIG (Claude Code, Cursor, etc.):");
  console.log("-------------------------------------------------------");
  console.log(JSON.stringify(config, null, 2));
  console.log("-------------------------------------------------------");
  console.log("\nNote: Ensure you have your GROQ_API_KEY or OLLAMA_URL set in:");
  console.log(envPath);
}

generateConfig();
