import { v4 as uuidv4 } from "uuid";
import { getSqlite } from "./sqlite";
import { ISessionStore, Session, FullChat, Job } from "./storage.types";
import { logger } from "../utils/logger";

export class SqliteSessionStore implements ISessionStore {
  private db = getSqlite();

  async createSession(projectName: string, platform: string, externalChatId?: string, customId?: string): Promise<Session> {
    const id = customId || uuidv4();
    const now = new Date().toISOString();
    
    logger.info(`[STORAGE] Creating session: "${projectName}" with ID: "${id}"`);

    const session: Session = {
      _id: id,
      projectName,
      platform,
      tripleCount: 0,
      topicCount: 0,
      hasFullChat: false,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };

    this.db.prepare(`
      INSERT INTO sessions (id, projectName, platform, tripleCount, topicCount, hasFullChat, createdAt, updatedAt, externalChatId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectName, platform, 0, 0, 0, now, now, externalChatId || null);

    return session;
  }

  async getSessions(): Promise<Session[]> {
    const rows = this.db.prepare("SELECT * FROM sessions ORDER BY updatedAt DESC").all();
    return rows.map(this.mapRowToSession);
  }

  async getSession(id: string): Promise<Session | null> {
    logger.debug(`[STORAGE] Looking up session ID: "${id}"`);
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!row) logger.warn(`[STORAGE] Session ID "${id}" NOT FOUND in database`);
    return row ? this.mapRowToSession(row) : null;
  }

  async getSessionByExternalId(externalChatId: string): Promise<Session | null> {
    const row = this.db.prepare("SELECT * FROM sessions WHERE externalChatId = ?").get(externalChatId);
    return row ? this.mapRowToSession(row) : null;
  }

  async getSessionByName(projectName: string): Promise<Session | null> {
    const row = this.db.prepare("SELECT * FROM sessions WHERE projectName = ?").get(projectName);
    return row ? this.mapRowToSession(row) : null;
  }

  async updateSession(id: string, update: Partial<Session>): Promise<void> {
    const fields = Object.keys(update)
      .filter(k => !["_id", "id", "createdAt"].includes(k))
      .map(k => {
        const dbKey = k === "hasFullChat" ? "hasFullChat" : k;
        return `${dbKey} = ?`;
      });
    
    if (fields.length === 0) return;

    const values = Object.keys(update)
      .filter(k => !["_id", "id", "createdAt"].includes(k))
      .map(k => {
        const val = (update as any)[k];
        if (k === "hasFullChat") return val ? 1 : 0;
        if (val instanceof Date) return val.toISOString();
        return val;
      });

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  async deleteSession(id: string): Promise<void> {
    // 1. Clean up vec_chunks (virtual table, no cascade support)
    this.db.prepare(`
      DELETE FROM vec_chunks 
      WHERE chunk_id IN (SELECT chunk_id FROM chunk_metadata WHERE sessionId = ?)
    `).run(id);

    // 2. Delete the session (cascades to chunk_metadata, facts, full_chats)
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  async getActiveSessionId(): Promise<string | null> {
    const row = this.db.prepare("SELECT sessionId FROM active_session WHERE id = 'singleton'").get() as any;
    return row?.sessionId ?? null;
  }

  async setActiveSessionId(sessionId: string | null): Promise<void> {
    this.db.prepare("UPDATE active_session SET sessionId = ? WHERE id = 'singleton'").run(sessionId);
  }

  async saveFullChat(sessionId: string, rawText: string, messageCount: number, platform: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO full_chats (sessionId, rawText, messageCount, platform, createdAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sessionId) DO UPDATE SET
        rawText = excluded.rawText,
        messageCount = excluded.messageCount,
        platform = excluded.platform
    `).run(sessionId, rawText, messageCount, platform, now);
    
    await this.updateSession(sessionId, { hasFullChat: true });
  }

  async updateFullChat(sessionId: string, update: Partial<FullChat>): Promise<void> {
    const fields = Object.keys(update)
      .filter(k => !["sessionId", "createdAt"].includes(k))
      .map(k => `${k} = ?`);
    
    if (fields.length === 0) return;

    const values = Object.keys(update)
      .filter(k => !["sessionId", "createdAt"].includes(k))
      .map(k => (update as any)[k]);

    values.push(sessionId);

    this.db.prepare(`UPDATE full_chats SET ${fields.join(", ")} WHERE sessionId = ?`).run(...values);
  }

  async getFullChat(sessionId: string): Promise<FullChat | null> {
    const row = this.db.prepare("SELECT * FROM full_chats WHERE sessionId = ?").get(sessionId) as any;
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      rawText: row.rawText,
      processedText: row.processedText,
      messageCount: row.messageCount,
      platform: row.platform,
      createdAt: new Date(row.createdAt)
    };
  }

  async createJob(type: string, payload: any): Promise<Job> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const job: Job = {
      _id: id,
      type: type as any,
      payload,
      status: "PENDING",
      deadLettered: false,
      attempts: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };

    this.db.prepare(`
      INSERT INTO jobs (id, type, payload, status, deadLettered, attempts, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, JSON.stringify(payload), "PENDING", 0, 0, now, now);

    return job;
  }

  async getNextJob(): Promise<Job | null> {
    const row = this.db.prepare(`
      SELECT * FROM jobs 
      WHERE status = 'PENDING' AND deadLettered = 0 
      ORDER BY createdAt ASC 
      LIMIT 1
    `).get() as any;
    
    if (!row) return null;
    return this.mapRowToJob(row);
  }

  async updateJob(id: string, update: Partial<Job>): Promise<void> {
    const fields = Object.keys(update)
      .filter(k => !["_id", "id", "createdAt"].includes(k))
      .map(k => `${k} = ?`);
    
    if (fields.length === 0) return;

    const values = Object.keys(update)
      .filter(k => !["_id", "id", "createdAt"].includes(k))
      .map(k => {
        const val = (update as any)[k];
        if (k === "deadLettered") return val ? 1 : 0;
        if (val instanceof Date) return val.toISOString();
        if (k === "payload") return JSON.stringify(val);
        return val;
      });

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  async getJobStatus(): Promise<{ pending: number; processing: number; deadLettered: number }> {
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'PENDING' AND deadLettered = 0").get() as any;
    const processing = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'PROCESSING'").get() as any;
    const deadLettered = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE deadLettered = 1").get() as any;
    
    return {
      pending: pending.count,
      processing: processing.count,
      deadLettered: deadLettered.count
    };
  }

  async getJobStatusBySession(sessionId: string): Promise<{ pending: number; processing: number; deadLettered: number }> {
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'PENDING' AND deadLettered = 0 AND json_extract(payload, '$.sessionId') = ?").get(sessionId) as any;
    const processing = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'PROCESSING' AND json_extract(payload, '$.sessionId') = ?").get(sessionId) as any;
    const deadLettered = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE deadLettered = 1 AND json_extract(payload, '$.sessionId') = ?").get(sessionId) as any;
    
    return {
      pending: pending.count,
      processing: processing.count,
      deadLettered: deadLettered.count
    };
  }

  async resetGhostJobs(): Promise<void> {
    // Only resume jobs that haven't failed repeatedly
    this.db.prepare("UPDATE jobs SET status = 'PENDING' WHERE status = 'PROCESSING' AND attempts < 2").run();
    // Mark heavily failing ghost jobs as FAILED instead of looping forever
    this.db.prepare("UPDATE jobs SET status = 'FAILED', error = 'Abandoned after multiple crash/resume cycles' WHERE status = 'PROCESSING' AND attempts >= 2").run();
  }

  async clearJobs(): Promise<void> {
    this.db.prepare("DELETE FROM jobs").run();
  }

  private mapRowToSession(row: any): Session {
    return {
      _id: row.id,
      projectName: row.projectName,
      platform: row.platform,
      summary: row.summary,
      tripleCount: row.tripleCount,
      topicCount: row.topicCount,
      hasFullChat: row.hasFullChat === 1,
      externalChatId: row.externalChatId,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapRowToJob(row: any): Job {
    return {
      _id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      status: row.status,
      deadLettered: row.deadLettered === 1,
      failedAt: row.failedAt ? new Date(row.failedAt) : undefined,
      error: row.error,
      attempts: row.attempts,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}
