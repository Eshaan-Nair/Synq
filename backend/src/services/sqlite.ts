import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "synq.db");

let db: Database.Database;

export function initSqlite() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  
  // Load sqlite-vec extension
  sqliteVec.load(db);
  
  logger.success(`SQLite initialized at ${DB_PATH}`);
  
  createTables();
}

function createTables() {
  // Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      projectName TEXT NOT NULL,
      platform TEXT,
      summary TEXT,
      tripleCount INTEGER DEFAULT 0,
      topicCount INTEGER DEFAULT 0,
      hasFullChat INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);

  // Full Chats
  db.exec(`
    CREATE TABLE IF NOT EXISTS full_chats (
      sessionId TEXT PRIMARY KEY,
      rawText TEXT NOT NULL,
      messageCount INTEGER DEFAULT 0,
      platform TEXT,
      createdAt TEXT,
      FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Active Session
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_session (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      sessionId TEXT,
      FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE SET NULL
    )
  `);
  db.exec("INSERT OR IGNORE INTO active_session (id, sessionId) VALUES ('singleton', NULL)");

  // Jobs
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      deadLettered INTEGER DEFAULT 0,
      failedAt TEXT,
      error TEXT,
      attempts INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, createdAt)");

  // Facts (Knowledge Graph)
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL,
      subject TEXT NOT NULL,
      subjectType TEXT,
      relation TEXT NOT NULL,
      object TEXT NOT NULL,
      objectType TEXT,
      timestamp TEXT,
      FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(sessionId)");

  // Vectors (RAG)
  // sqlite-vec uses virtual tables for vector search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      chunk_id TEXT PRIMARY KEY,
      embedding float[768]
    )
  `);
  
  // Metadata for chunks (since vec0 is just for search)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunk_metadata (
      chunk_id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      chunkIndex INTEGER,
      content TEXT NOT NULL,
      FOREIGN KEY(chunk_id) REFERENCES vec_chunks(chunk_id) ON DELETE CASCADE
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunk_metadata(sessionId)");
}

export function getSqlite(): Database.Database {
  if (!db) initSqlite();
  return db;
}
