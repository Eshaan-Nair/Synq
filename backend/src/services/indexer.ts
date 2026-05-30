import fs from "fs";
import path from "path";
import crypto from "crypto";
import ignore from "ignore";
import { logger } from "../utils/logger";
import { WindowChunk } from "./chunker";
import { vectorStore } from "./storage";

const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  ".DS_Store",
  "dist",
  "build",
  "coverage",
  "*.log",
  "*.sqlite",
  "*.db",
  "*.jpg",
  "*.jpeg",
  "*.png",
  "*.gif",
  "*.pdf",
  "*.mp4",
  "*.mp3",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml"
];

function getFileHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function chunkCodeFile(content: string, filePath: string, sessionId: string): WindowChunk[] {
  const lines = content.split("\n");
  const CHUNK_SIZE = 150;
  const OVERLAP = 50;
  const step = CHUNK_SIZE - OVERLAP;
  
  const chunks: WindowChunk[] = [];
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i += step) {
    const chunkLines = lines.slice(i, i + CHUNK_SIZE);
    if (chunkLines.length === 0) break;
    
    // Create the content payload
    const payload = `[FILE: ${filePath} (Part ${chunkIndex + 1})]\n\n${chunkLines.join("\n")}`;
    
    chunks.push({
      id: `${sessionId}-file-${Buffer.from(filePath).toString("hex").slice(0, 8)}-${chunkIndex}`,
      sessionId,
      content: payload,
      chunkIndex,
      wordStart: i, // We use lines instead of words for code
      wordEnd: i + chunkLines.length,
      filePath,
      fileHash: getFileHash(content)
    });
    
    chunkIndex++;
    if (i + CHUNK_SIZE >= lines.length) break;
  }
  
  return chunks;
}

export async function indexCodebase(workspaceRoot: string, sessionId: string) {
  logger.info(`Starting codebase indexing for ${workspaceRoot}`);
  
  const ig = ignore().add(DEFAULT_IGNORES);
  
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    ig.add(gitignore);
  }

  let filesScanned = 0;
  let filesSkipped = 0;

  async function walk(dir: string, relativeDir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const relPath = path.join(relativeDir, entry.name);
      const absPath = path.join(dir, entry.name);
      
      // Skip if ignored
      if (ig.ignores(relPath)) {
        filesSkipped++;
        continue;
      }
      
      if (entry.isDirectory()) {
        await walk(absPath, relPath);
      } else {
        // Basic binary check (skip files > 1MB)
        try {
          const stats = fs.statSync(absPath);
          if (stats.size > 1024 * 1024) {
            filesSkipped++;
            continue;
          }
          
          const content = fs.readFileSync(absPath, "utf-8");
          // Skip if looks like binary (contains null bytes)
          if (content.indexOf("\0") !== -1) {
            filesSkipped++;
            continue;
          }

          const chunks = chunkCodeFile(content, relPath, sessionId);
          if (chunks.length > 0) {
            await vectorStore.storeFileChunks(chunks);
            filesScanned++;
          }
        } catch (e) {
          logger.warn(`Failed to process file ${absPath}: ${e}`);
          filesSkipped++;
        }
      }
    }
  }

  await walk(workspaceRoot, "");
  logger.success(`Codebase indexing complete. Scanned: ${filesScanned}, Skipped: ${filesSkipped}`);
  return { filesScanned, filesSkipped };
}
