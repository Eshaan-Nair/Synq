import { getSqlite } from "./sqlite";
import { IGraphStore, Triple } from "./storage.types";

export class SqliteGraphStore implements IGraphStore {
  private db = getSqlite();

  async saveTriple(triple: Triple): Promise<void> {
    this.db.prepare(`
      INSERT INTO facts (sessionId, subject, subjectType, relation, object, objectType, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      triple.sessionId,
      triple.subject,
      triple.subjectType,
      triple.relation,
      triple.object,
      triple.objectType,
      triple.timestamp || new Date().toISOString()
    );
  }

  async getTriplesBySession(sessionId: string): Promise<Triple[]> {
    const rows = this.db.prepare(`
      SELECT * FROM facts WHERE sessionId = ? ORDER BY timestamp ASC
    `).all(sessionId) as any[];

    return rows.map(row => ({
      subject: row.subject,
      subjectType: row.subjectType,
      relation: row.relation,
      object: row.object,
      objectType: row.objectType,
      sessionId: row.sessionId,
      timestamp: row.timestamp
    }));
  }
  async getGraphData(filters: { sessionId?: string; type?: string; relation?: string; limit?: number }): Promise<{ nodes: any[]; links: any[] }> {
    let query = "SELECT * FROM facts WHERE 1=1";
    const params: any[] = [];

    if (filters.sessionId) {
      query += " AND sessionId = ?";
      params.push(filters.sessionId);
    }
    if (filters.type) {
      query += " AND (subjectType = ? OR objectType = ?)";
      params.push(filters.type, filters.type);
    }
    if (filters.relation) {
      query += " AND relation = ?";
      params.push(filters.relation);
    }
    
    query += " ORDER BY timestamp DESC";
    if (filters.limit) {
      query += " LIMIT ?";
      params.push(filters.limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    
    const nodes = new Map<string, any>();
    const links: any[] = [];

    for (const row of rows) {
      if (!nodes.has(row.subject)) nodes.set(row.subject, { id: row.subject, type: row.subjectType });
      if (!nodes.has(row.object)) nodes.set(row.object, { id: row.object, type: row.objectType });
      
      links.push({
        source: row.subject,
        target: row.object,
        relation: row.relation
      });
    }

    return { nodes: Array.from(nodes.values()), links };
  }

  async deleteTriplesBySession(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM facts WHERE sessionId = ?").run(sessionId);
  }
}
