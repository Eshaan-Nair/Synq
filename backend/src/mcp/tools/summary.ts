import { sessionStore, graphStore } from "../../services/storage";

export async function getProjectSummary(
  projectId: string
): Promise<string> {
  try {
    const session = await sessionStore.getSession(projectId);
    if (!session) {
      return `Error: Project ${projectId} not found.`;
    }

    if (session.summary) {
      return `Project Summary for "${session.projectName}":\n\n${session.summary}`;
    }

    // Fallback: list recent facts if no summary exists
    const triples = await graphStore.getTriplesBySession(projectId);
    if (triples.length === 0) {
      return `Project "${session.projectName}" is empty. No summary or facts available.`;
    }

    const facts = triples.slice(-10).map(t => 
      `- ${t.subject} (${t.subjectType}) --[${t.relation}]--> ${t.object} (${t.objectType})`
    );

    return `Project "${session.projectName}" (no summary available).\n\nRecent Facts:\n${facts.join("\n")}`;
  } catch (err: any) {
    return `get_project_summary failed: ${err.message}`;
  }
}
