import { ISessionStore, IGraphStore, IVectorStore, FullChat } from "./storage.types";
import { SqliteSessionStore } from "./sqlite-session";
import { SqliteGraphStore } from "./sqlite-graph";
import { SqliteVectorStore } from "./sqlite-vector";
import { logger } from "../utils/logger";

// We will keep the legacy imports as "Docker" implementations
// These are wrapped in classes to match the unified storage interface.
import * as mongoService from "./mongo";
import * as neo4jService from "./neo4j";
import * as chromaService from "./chroma";

const STORAGE_MODE = (process.env.GLIA_STORAGE_MODE || "docker").toLowerCase();

class DockerSessionStore implements ISessionStore {
  private mapMongoSession(doc: any): any {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
      _id: obj._id.toString(),
      projectName: obj.projectName,
      platform: obj.platform,
      summary: obj.summary,
      tripleCount: obj.tripleCount || 0,
      hasFullChat: obj.hasFullChat || false,
      topicCount: obj.topicCount || 0,
      externalChatId: obj.externalChatId,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  private mapMongoJob(doc: any): any {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
      _id: obj._id.toString(),
      type: obj.type,
      payload: obj.payload,
      status: obj.status,
      deadLettered: obj.deadLettered || false,
      attempts: obj.attempts || 0,
      error: obj.error,
      failedAt: obj.failedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  // Bridge to existing mongo.ts exports
  async createSession(projectName: string, platform: string, externalChatId?: string, customId?: string) {
    const s = new mongoService.Session({ 
      _id: customId || undefined, // MongoDB can use custom _id
      projectName, 
      platform, 
      externalChatId 
    });
    await s.save();
    return this.mapMongoSession(s);
  }
  async getSessions() {
    const docs = await mongoService.Session.find().sort({ updatedAt: -1 });
    return docs.map(s => this.mapMongoSession(s));
  }
  async getSession(id: string) {
    const s = await mongoService.Session.findById(id);
    return this.mapMongoSession(s);
  }
  async getSessionByName(projectName: string) {
    const s = await mongoService.Session.findOne({ projectName } as any);
    return this.mapMongoSession(s);
  }
  async getSessionByExternalId(externalChatId: string) {
    const s = await mongoService.Session.findOne({ externalChatId } as any);
    return this.mapMongoSession(s);
  }
  async updateSession(id: string, update: any) {
    await mongoService.Session.findByIdAndUpdate(id, update);
  }
  async deleteSession(id: string) {
    await mongoService.Session.findByIdAndDelete(id);
  }
  async getActiveSessionId() {
    return mongoService.getActiveSessionId();
  }
  async setActiveSessionId(sessionId: string | null) {
    await mongoService.setActiveSessionId(sessionId);
  }
  async saveFullChat(sessionId: string, rawText: string, messageCount: number, platform: string) {
    await mongoService.FullChat.findOneAndUpdate(
      { sessionId },
      { $set: { rawText, messageCount, platform } },
      { upsert: true }
    );
    await this.updateSession(sessionId, { hasFullChat: true });
  }
  async updateFullChat(sessionId: string, update: Partial<FullChat>) {
    await mongoService.FullChat.findOneAndUpdate({ sessionId }, { $set: update });
  }
  async getFullChat(sessionId: string) {
    const c = await mongoService.FullChat.findOne({ sessionId });
    if (!c) return null;
    const obj = c.toObject();
    return {
      sessionId: obj.sessionId,
      rawText: obj.rawText,
      processedText: obj.processedText,
      messageCount: obj.messageCount || 0,
      platform: obj.platform || "unknown",
      createdAt: obj.createdAt
    };
  }
  async createJob(type: string, payload: any) {
    const j = new mongoService.Job({ type, payload });
    await j.save();
    return this.mapMongoJob(j);
  }
  async getNextJob() {
    const j = await mongoService.Job.findOne({ status: "PENDING", deadLettered: false }).sort({ createdAt: 1 });
    return this.mapMongoJob(j);
  }
  async updateJob(id: string, update: any) {
    await mongoService.Job.findByIdAndUpdate(id, update);
  }
  async getJobStatus() {
    const pending = await mongoService.Job.countDocuments({ status: "PENDING", deadLettered: false });
    const processing = await mongoService.Job.countDocuments({ status: "PROCESSING" });
    const deadLettered = await mongoService.Job.countDocuments({ deadLettered: true });
    return { pending, processing, deadLettered };
  }
  async getJobStatusBySession(sessionId: string) {
    const pending = await mongoService.Job.countDocuments({ "payload.sessionId": sessionId, status: "PENDING", deadLettered: false });
    const processing = await mongoService.Job.countDocuments({ "payload.sessionId": sessionId, status: "PROCESSING" });
    const deadLettered = await mongoService.Job.countDocuments({ "payload.sessionId": sessionId, deadLettered: true });
    return { pending, processing, deadLettered };
  }
  async resetGhostJobs() {
    await mongoService.Job.updateMany({ status: "PROCESSING" }, { $set: { status: "PENDING" } });
  }
  async clearJobs() {
    await mongoService.Job.deleteMany({});
  }
}

class DockerGraphStore implements IGraphStore {
  async saveTriple(t: any) {
    await neo4jService.saveTriple(t.subject, t.subjectType, t.relation, t.object, t.objectType, t.sessionId);
  }
  async getTripleCountBySession(sessionId: string) {
    const d = neo4jService.getDriver();
    const session = d.session();
    try {
      const res = await session.run(
        "MATCH (:Entity)-[r:RELATION {sessionId: $sessionId}]->(:Entity) RETURN count(r) as count",
        { sessionId }
      );
      return res.records[0].get("count").toInt();
    } finally {
      await session.close();
    }
  }
  async getTriplesBySession(sessionId: string) {
    const triples = await neo4jService.getTriplesBySession(sessionId);
    return triples.map(t => ({ ...t, sessionId }));
  }
  async getGraphData(filters: { sessionId?: string; type?: string; relation?: string; limit?: number }) {
    const session = neo4jService.getDriver().session();
    try {
      let query = `MATCH (s:Entity)-[r:RELATION]->(o:Entity)`;
      const params: Record<string, any> = { limit: filters.limit || 200 };

      if (filters.sessionId) {
        query += ` WHERE r.sessionId = $sessionId`;
        params.sessionId = filters.sessionId;
      }

      if (filters.type) {
        const op = filters.sessionId ? "AND" : "WHERE";
        query += ` ${op} (s.type = $type OR o.type = $type)`;
        params.type = filters.type;
      }

      if (filters.relation) {
        const op = (filters.sessionId || filters.type) ? "AND" : "WHERE";
        query += ` ${op} r.type = $relation`;
        params.relation = filters.relation;
      }

      query += `
        RETURN s.name AS source, s.type AS sourceType,
               r.type AS relation, r.timestamp AS timestamp,
               o.name AS target, o.type AS targetType
        LIMIT $limit
      `;

      const result = await session.run(query, params);
      const nodes = new Map<string, any>();
      const links: any[] = [];

      result.records.forEach((rec) => {
        const src = rec.get("source");
        const tgt = rec.get("target");
        const ts = rec.get("timestamp"); // Assuming Neo4j r.timestamp is available
        if (!nodes.has(src)) nodes.set(src, { id: src, type: rec.get("sourceType"), firstSeen: ts });
        if (!nodes.has(tgt)) nodes.set(tgt, { id: tgt, type: rec.get("targetType"), firstSeen: ts });
        links.push({ source: src, target: tgt, relation: rec.get("relation"), timestamp: ts });
      });

      const nodeArray = Array.from(nodes.values());
      
      // Assign basic communities based on connected components
      const visited = new Set<string>();
      let communityCounter = 0;
      
      for (const startNode of nodeArray) {
        if (visited.has(startNode.id)) continue;
        
        communityCounter++;
        const queue = [startNode.id];
        visited.add(startNode.id);
        
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          const node = nodes.get(currentId);
          if (node) node.community = communityCounter;
          
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
    } finally {
      await session.close();
    }
  }
  async findRelatedTriples(entities: string[], sessionId: string): Promise<any[]> {
    const session = neo4jService.getDriver().session();
    try {
      const query = `
        MATCH (s:Entity)-[r:RELATION]->(o:Entity)
        WHERE r.sessionId = $sessionId
        AND (s.name IN $entities OR o.name IN $entities)
        RETURN s.name AS subject, s.type AS subjectType,
               r.type AS relation,
               o.name AS object, o.type AS objectType,
               r.timestamp AS timestamp
        LIMIT 15
      `;
      const result = await session.run(query, { sessionId, entities });
      return result.records.map(rec => ({
        subject: rec.get("subject"),
        subjectType: rec.get("subjectType"),
        relation: rec.get("relation"),
        object: rec.get("object"),
        objectType: rec.get("objectType"),
        sessionId,
        timestamp: rec.get("timestamp")
      }));
    } finally {
      await session.close();
    }
  }

  async findRelatedTriplesGlobal(entities: string[]): Promise<any[]> {
    const session = neo4jService.getDriver().session();
    try {
      const query = `
        MATCH (s:Entity)-[r:RELATION]->(o:Entity)
        WHERE s.name IN $entities OR o.name IN $entities
        RETURN s.name AS subject, s.type AS subjectType,
               r.type AS relation,
               o.name AS object, o.type AS objectType,
               r.timestamp AS timestamp
        LIMIT 20
      `;
      const result = await session.run(query, { entities });
      return result.records.map(rec => ({
        subject: rec.get("subject"),
        subjectType: rec.get("subjectType"),
        relation: rec.get("relation"),
        object: rec.get("object"),
        objectType: rec.get("objectType"),
        sessionId: "global",
        timestamp: rec.get("timestamp")
      }));
    } finally {
      await session.close();
    }
  }

  async deleteTriples(entities: string[], sessionId: string): Promise<number> {
    return neo4jService.deleteTriples(entities, sessionId);
  }
}

class DockerVectorStore implements IVectorStore {
  async storeChunks(chunks: any[]) {
    await chromaService.storeWindowChunks(chunks);
  }
  async retrieveRelevantChunks(query: string, sessionId: string, topN?: number) {
    return chromaService.retrieveRelevantChunks(query, sessionId, topN);
  }
  async retrieveGlobalChunks(query: string, topN?: number) {
    return chromaService.retrieveGlobalChunks(query, topN);
  }
  async hybridSearch(query: string, sessionId: string, topN?: number) {
    return this.retrieveRelevantChunks(query, sessionId, topN);
  }
  async deleteChunksBySession(sessionId: string) {
    await chromaService.deleteChunksBySession(sessionId);
  }
  async deleteChunksByQuery(query: string, sessionId: string): Promise<number> {
    return chromaService.deleteChunksByQuery(query, sessionId);
  }
}

let sessionStore: ISessionStore;
let graphStore: IGraphStore;
let vectorStore: IVectorStore;

if (STORAGE_MODE === "sqlite") {
  sessionStore = new SqliteSessionStore();
  graphStore = new SqliteGraphStore();
  vectorStore = new SqliteVectorStore();
} else {
  sessionStore = new DockerSessionStore();
  graphStore = new DockerGraphStore();
  vectorStore = new DockerVectorStore();
}

/**
 * Unified storage initialization helper.
 * Handles conditional connection to Mongo/Neo4j/Chroma or SQLite.
 */
export async function initStorage() {
  if (STORAGE_MODE === "sqlite") {
    logger.info("Initializing Glia in SQLITE mode (Zero-Docker)");
    const { initSqlite } = require("./sqlite");
    initSqlite();
  } else {
    logger.info("Initializing Glia in DOCKER mode (Mongo/Neo4j/Chroma)");
    const { connectMongo } = require("./mongo");
    const { connectNeo4j } = require("./neo4j");
    const { connectChroma } = require("./chroma");

    try {
      await connectMongo();
      await connectNeo4j();
      await connectChroma(); // non-fatal if down, chroma handles internally
    } catch (err) {
      logger.error("Failed to connect to Docker databases:");
      logger.error(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
}

export * from "./storage.types";
export { sessionStore, graphStore, vectorStore };
