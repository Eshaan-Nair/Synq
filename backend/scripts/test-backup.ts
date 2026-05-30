import { initSqlite } from "../src/services/sqlite";
import { runBackupCheck } from "../src/services/backup";
import { logger } from "../src/utils/logger";
import fs from "fs";
import path from "path";

async function run() {
  process.env.ARCRIFT_STORAGE_MODE = 'sqlite';
  
  // Only init SQLite, avoid Ollama
  initSqlite();
  
  logger.info("Triggering first backup check...");
  await runBackupCheck();
  
  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "ArcRift.db");
  const backupDir = path.join(path.dirname(dbPath), "backups");
  
  logger.info(`Backup dir: ${backupDir}`);
  const files = fs.readdirSync(backupDir);
  logger.info(`Files in backup dir: ${files.join(", ")}`);

  logger.info("Triggering second backup check (should NOT create backup)...");
  await runBackupCheck();
  
  logger.info("Simulating older backups to trigger cleanup...");
  
  for (let i = 0; i < 5; i++) {
    const dummyPath = path.join(backupDir, `ArcRift-backup-dummy-${i}.sqlite`);
    fs.writeFileSync(dummyPath, "dummy");
    // set mtime to older values
    fs.utimesSync(dummyPath, new Date(), new Date(Date.now() - (10 * 24 * 60 * 60 * 1000) - (i * 1000)));
  }
  
  logger.info("Triggering third backup check (should create backup due to dummy being old, and clean up the rest)...");
  await runBackupCheck();
  
  const finalFiles = fs.readdirSync(backupDir);
  logger.info(`Final files in backup dir (should be max 4): ${finalFiles.length} files`);
  
  logger.info("Backup test complete.");
}

run().catch(console.error);
