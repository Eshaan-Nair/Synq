import { getSqlite } from "./sqlite";
import { IGraphStore, Triple } from "./storage.types";

export class SqliteGraphStore implements IGraphStore {
  private db = getSqlite();

  async saveTriple(triple: Triple): Promise<void> {
    this.db.prepare(`
      INSERT OR IGNORE INTO facts (sessionId, subject, subjectType, relation, object, objectType, timestamp)
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

  async getTripleCountBySession(sessionId: string): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM facts WHERE sessionId = ?").get(sessionId) as any;
    return row?.count || 0;
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
      const ts = row.timestamp;
      
      if (!nodes.has(row.subject)) {
        nodes.set(row.subject, { id: row.subject, type: row.subjectType, firstSeen: ts });
      }
      if (!nodes.has(row.object)) {
        nodes.set(row.object, { id: row.object, type: row.objectType, firstSeen: ts });
      }
      
      links.push({
        source: row.subject,
        target: row.object,
        relation: row.relation,
        timestamp: ts
      });
    }

    // Assign basic communities based on connected components
    const visited = new Set<string>();
    let communityCounter = 0;
    const nodeIds = Array.from(nodes.keys());
    
    for (const startId of nodeIds) {
      if (visited.has(startId)) continue;
      
      communityCounter++;
      const queue = [startId];
      visited.add(startId);
      
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const node = nodes.get(currentId);
        if (node) node.community = communityCounter;
        
        // Find neighbors
        for (const link of links) {
          if (link.source === currentId && !visited.has(link.target)) {
            visited.add(link.target);
            queue.push(link.target);
          } else if (link.target === currentId && !visited.has(link.source)) {
            visited.add(link.source);
            queue.push(link.source);
          }
        }
      }
    }

    return { nodes: Array.from(nodes.values()), links };
  }
  async findRelatedTriples(entities: string[], sessionId: string): Promise<Triple[]> {
    if (entities.length === 0) return [];
    
    // Create placeholders (?, ?, ?)
    const placeholders = entities.map(() => "?").join(",");
    const query = `
      SELECT * FROM facts 
      WHERE sessionId = ? 
      AND (subject IN (${placeholders}) OR object IN (${placeholders}))
      LIMIT 15
    `;
    
    const rows = this.db.prepare(query).all(sessionId, ...entities, ...entities) as any[];
    
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
  async findRelatedTriplesGlobal(entities: string[]): Promise<Triple[]> {
    if (entities.length === 0) return [];
    
    const placeholders = entities.map(() => "?").join(",");
    const query = `
      SELECT * FROM facts 
      WHERE subject IN (${placeholders}) OR object IN (${placeholders})
      LIMIT 20
    `;
    
    const rows = this.db.prepare(query).all(...entities, ...entities) as any[];
    
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
}
