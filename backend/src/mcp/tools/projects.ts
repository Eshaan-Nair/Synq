import { sessionStore } from "../../services/storage";

export async function listProjects(): Promise<string> {
  const sessions = await sessionStore.getSessions();
  if (sessions.length === 0) {
    return "No Synq projects found.";
  }

  const lines = sessions.map(s => 
    `- [${s._id}] ${s.projectName} (${s.tripleCount} facts, platform: ${s.platform})`
  );

  return `Available Synq Projects:\n${lines.join("\n")}`;
}
