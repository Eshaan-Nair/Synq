/**
 * mcp/tools/projects.ts — list_projects tool
 * 
 * Lists all Glia projects (sessions) stored in the database.
 */

import { sessionStore } from "../../services/storage";

export async function listProjects(): Promise<string> {
  try {
    const sessions = await sessionStore.getSessions();

    if (sessions.length === 0) {
      return "No Glia projects found. Use the Glia extension to save chats first.";
    }

    const lines = sessions.map(s => 
      `- ${s.projectName} [ID: ${s._id}] (${s.platform}) — ${s.tripleCount} facts, updated ${new Date(s.updatedAt).toLocaleDateString()}`
    );

    return `Available Glia Projects:\n\n${lines.join("\n")}\n\nUse list_projects with any of these IDs to recall or search context.`;
  } catch (err: any) {
    return `Failed to list projects: ${err.message ?? String(err)}`;
  }
}
