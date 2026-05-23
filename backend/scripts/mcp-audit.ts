
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

async function runMcpAudit() {
  console.log("========================================");
  console.log("  ARCRIFT MCP END-TO-END TEST v1.5.1");
  console.log("========================================");

  const serverPath = path.resolve(__dirname, "../dist/src/mcp/server.js");
  const dbPath = path.resolve(__dirname, "../ArcRift.db");

  // Inject a test session into SQLite so tools have a target
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    const id = "audit-demo";
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO sessions (id, projectName, platform, tripleCount, topicCount, hasFullChat, createdAt, updatedAt) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, "Audit Demo Project", "mcp", 0, 0, 0, now, now);

    db.close();
    console.log("[ArcRift] Injected audit-demo project into database");
  } catch (err: any) {
    console.log(`[ArcRift] Database injection note: ${err.message}`);
  }

  const server = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ARCRIFT_STORAGE_MODE: "sqlite", ARCRIFT_MCP_MODE: "true" }
  });

  let messageId = 1;
  let targetProject = "audit-demo";

  function send(method: string, params: any = {}) {
    const request = { jsonrpc: "2.0", id: messageId++, method, params };
    const json = JSON.stringify(request) + "\n";
    server.stdin.write(json);
  }

  return new Promise((resolve, reject) => {
    // Increased wait time for engine warm-up
    setTimeout(() => {
      console.log("[CLIENT] Sending initialize...");
      send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ArcRift-Test", version: "1.0.0" }
      });
    }, 10000);

    server.stdout.on("data", (data) => {
      const chunks = data.toString().split("\n");
      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;

        console.log(`[RAW STDOUT] ${trimmed.substring(0, 100)}${trimmed.length > 100 ? '...' : ''}`);

        if (!trimmed.startsWith("{")) continue;

        try {
          const response = JSON.parse(trimmed);

          if (response.id === 1) {
            console.log("[PASS] Handshake Complete");
            send("notifications/initialized");

            console.log("PHASE 1: Storing secret memory...");
            send("tools/call", {
              name: "store_memory",
              arguments: {
                text: "The ARCRIFT secret password is: NEBULA-999",
                project: targetProject
              }
            });
          }
          else if (response.result?.content) {
            const text = response.result.content[0].text;

            if (text.includes("Successfully stored")) {
              console.log("[PASS] Memory saved successfully");
              console.log("PHASE 2: Recalling secret memory...");
              send("tools/call", {
                name: "recall_context",
                arguments: {
                  prompt: "What is the secret password?",
                  project: targetProject
                }
              });
            } else if (text.includes("Recalled memory")) {
              if (text.includes("NEBULA-999")) {
                console.log("[PASS] recall_context retrieved the secret!");
                console.log("========================================");
                console.log("  END-TO-END TEST: 100% SUCCESS");
                console.log("========================================");
                server.kill();
                resolve(true);
              } else {
                console.log("[FAIL] Memory recalled but secret was not found.");
                server.kill();
                reject(new Error("Secret not found in recall"));
              }
            }
          }
        } catch (err) { }
      }
    });

    server.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[SERVER LOG] ${msg}`);
    });

    setTimeout(() => {
      server.kill();
      reject(new Error("Audit timed out. Check server logs above."));
    }, 90000);
  });
}

runMcpAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
