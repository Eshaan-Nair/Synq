/**
 * mcp/tools/summary.ts — get_project_summary tool
 *
 * Returns a structured knowledge-graph summary for a project,
 * built from Neo4j triples extracted from past conversations.
 */

import { getTriplesBySession } from "../../services/neo4j";
import { Session } from "../../services/mongo";
import { generateProjectSummary } from "../../services/extractor";

export async function getSummary(project: string): Promise<string> {
  try {
    if (!project?.trim()) {
      return "project name is required.";
    }

    const session = await Session.findOne({ projectName: project })
      .sort({ updatedAt: -1 })
      .select("_id projectName summary tripleCount");

    if (!session) {
      return `No project found with name "${project}". Use list_projects to see available projects.`;
    }

    const sessionId = session._id.toString();

    // Use cached summary if triple count matches
    if (session.summary && session.tripleCount && session.tripleCount > 0) {
      return (
        `Knowledge graph summary for "${project}":\n\n` +
        session.summary +
        `\n\n(${session.tripleCount} triples | session: ${sessionId})`
      );
    }

    // Generate fresh summary from Neo4j triples
    const triples = await getTriplesBySession(sessionId);

    if (triples.length === 0) {
      return (
        `Project "${project}" exists but has no knowledge graph triples yet.\n` +
        `Save a conversation with context about this project first.`
      );
    }

    const summary = await generateProjectSummary(triples, project);

    // Cache it
    await Session.findByIdAndUpdate(sessionId, {
      summary,
      tripleCount: triples.length,
    });

    return (
      `Knowledge graph summary for "${project}":\n\n` +
      summary +
      `\n\n(${triples.length} triples | session: ${sessionId})`
    );
  } catch (err: any) {
    return `get_project_summary failed: ${err.message ?? String(err)}`;
  }
}
