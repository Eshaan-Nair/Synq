/**
 * mcp/tools/summary.ts — get_project_summary tool
 * 
 * Returns the auto-generated project summary and a count of stored facts.
 */

import { sessionStore, graphStore } from "../../services/storage";

export async function getSummary(project: string): Promise<string> {
  try {
    const projectStr = String(project);
    const session = await sessionStore.getSession(projectStr);

    if (!session) {
      return `ArcRift project ID "${projectStr}" not found. Use list_projects to see valid IDs.`;
    }

    const triples = await graphStore.getTriplesBySession(projectStr);

    let summary = session.summary || "No summary generated yet. Save a chat with the ArcRift extension to build knowledge.";
    
    return `Project: ${session.projectName} (${session.platform})\n` +
           `Facts Stored: ${triples.length}\n` +
           `Last Updated: ${new Date(session.updatedAt).toLocaleDateString()}\n\n` +
           `Knowledge Summary:\n${summary}`;
  } catch (err: any) {
    return `get_project_summary failed: ${err.message ?? String(err)}`;
  }
}
