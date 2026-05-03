/**
 * mcp/tools/projects.ts — list_projects tool
 *
 * Returns all unique project names stored in MongoDB.
 * Useful for discovering what memory exists before calling recall_context.
 */

import { Session } from "../../services/mongo";

export async function listProjects(): Promise<string> {
  try {
    const sessions = await Session.find()
      .sort({ updatedAt: -1 })
      .select("projectName platform tripleCount topicCount updatedAt");

    if (sessions.length === 0) {
      return "No projects found in SYNQ memory. Save a conversation first.";
    }

    const lines = sessions.map(s => {
      const date = s.updatedAt
        ? new Date(s.updatedAt).toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
          })
        : "unknown date";
      return (
        `• ${s.projectName}` +
        `  [platform: ${s.platform ?? "mcp"}]` +
        `  [triples: ${s.tripleCount ?? 0}]` +
        `  [chunks: ${s.topicCount ?? 0}]` +
        `  [updated: ${date}]`
      );
    });

    return `SYNQ Projects (${sessions.length}):\n\n${lines.join("\n")}`;
  } catch (err: any) {
    return `list_projects failed: ${err.message ?? String(err)}`;
  }
}
