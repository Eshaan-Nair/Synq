
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "../src/utils/logger";

async function setupMcp() {
  const isWindows = process.platform === "win32";
  const claudeConfigPath = isWindows
    ? path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json")
    : path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");

  const serverPath = path.resolve(__dirname, "../dist/src/mcp/server.js");
  logger.info(`Checking for MCP server at: ${serverPath}`);
  
  // Ensure the server is built
  if (!fs.existsSync(serverPath)) {
    logger.error(`MCP Server NOT FOUND at ${serverPath}`);
    logger.warn("Please ensure 'npm run build' completed successfully in the backend folder.");
    return;
  }

  if (!fs.existsSync(claudeConfigPath)) {
    const configDir = path.dirname(claudeConfigPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));
    logger.info(`Created new Claude configuration at ${claudeConfigPath}`);
  }

  try {
    const configText = fs.readFileSync(claudeConfigPath, "utf-8");
    const config = JSON.parse(configText || '{"mcpServers": {}}');
    if (!config.mcpServers) config.mcpServers = {};

    config.mcpServers.ArcRift = {
      command: "node",
      args: [serverPath]
    };

    fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    logger.success("Claude Desktop MCP configuration updated successfully!");
    logger.info(`ArcRift Memory is now active in Claude Desktop/Code using: ${serverPath}`);
  } catch (err: any) {
    logger.error(`Failed to update Claude config: ${err.message}`);
  }
}

setupMcp();
