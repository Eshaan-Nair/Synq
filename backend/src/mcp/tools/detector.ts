/**
 * mcp/tools/detector.ts — identify_active_project tool
 * 
 * Automatically identifies the Synq project ID based on the current 
 * working directory or folder name.
 */

import { sessionStore } from "../../services/storage";
import path from "path";

export async function identifyProject(currentPath: string): Promise<string> {
  try {
    const sessions = await sessionStore.getSessions();
    if (sessions.length === 0) {
      return "No Synq projects found. Use the extension to save your first project.";
    }

    // Extract folder name from path
    const folderName = path.basename(currentPath).toLowerCase();
    
    // 1. Try exact match (case insensitive)
    const exact = sessions.find(s => s.projectName.toLowerCase() === folderName);
    if (exact) {
      return `Detected project: "${exact.projectName}" (ID: ${exact._id})`;
    }

    // 2. Try partial match (folder name contains project name or vice versa)
    const partial = sessions.find(s => 
      folderName.includes(s.projectName.toLowerCase()) || 
      s.projectName.toLowerCase().includes(folderName)
    );

    if (partial) {
      return `Possible project match: "${partial.projectName}" (ID: ${partial._id})`;
    }

    // 3. Fallback: list all projects
    const list = sessions.map(s => `- ${s.projectName} (ID: ${s._id})`).join("\n");
    return `Could not auto-detect project for "${folderName}". Available projects:\n${list}`;
  } catch (err: any) {
    return `identify_active_project failed: ${err.message ?? String(err)}`;
  }
}
