/**
 * Simple script to test MCP tools locally without a full MCP client.
 */
import { recall } from "./tools/recall";
import { identifyProject } from "./tools/detector";
import { initStorage, sessionStore } from "../services/storage";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

async function test() {
  await initStorage();
  console.log("--- Testing Project Detection ---");
  const sessions = await sessionStore.getSessions();
  if (sessions.length > 0) {
    const firstProject = sessions[0].projectName;
    const detected = await identifyProject(`C:/Code/${firstProject}`);
    console.log(`Input: C:/Code/${firstProject}`);
    console.log(`Result: ${detected}`);

    console.log("\n--- Testing Hybrid Recall ---");
    const projectID = sessions[0]._id;
    const recalled = await recall("test query", projectID);
    console.log(`Project: ${firstProject}`);
    console.log(`Output Snippet:\n${recalled.slice(0, 500)}...`);
  } else {
    console.log("No sessions found to test with.");
  }
}

test().catch(console.error);
