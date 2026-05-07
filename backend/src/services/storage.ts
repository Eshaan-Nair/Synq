import { ISessionStore, IGraphStore, IVectorStore, Session, FullChat, Job, Triple } from "./storage.types";
import { SqliteSessionStore } from "./sqlite-session";
import { SqliteGraphStore } from "./sqlite-graph";
import { SqliteVectorStore } from "./sqlite-vector";
import { logger } from "../utils/logger";

// We will keep the legacy imports as "Docker" implementations
// These will be refactored into classes in the next step to match the interface perfectly
import * as mongoService from "./mongo";
import * as neo4jService from "./neo4j";
import * as chromaService from "./chroma";

const STORAGE_MODE = (process.env.SYNQ_STORAGE_MODE || "docker").toLowerCase();

class DockerSessionStore implements ISessionStore {
  // Bridge to existing mongo.ts exports
  async createSession(projectName: string, platform: string): Promise<Session> {
    const s = new mongoService.Session({ projectName, platform });
    await s.save();
    return { ...s.toObject(), _id: s._id.toString() } as Session;
  }
  async getSessions(): Promise<Session[]> {
    const docs = await mongoService.Session.find().sort({ updatedAt: -1 });
    return docs.map(s => ({ ...s.toObject(), _id: s._id.toString() } as Session));
  }
  async getSession(id: string): Promise<Session | null> {
    const s = await mongoService.Session.findById(id);
    return s ? ({ ...s.toObject(), _id: s._id.toString() } as Session) : null;
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
      { rawText, messageCount, platform },
      { upsert: true }
    );
    await this.updateSession(sessionId, { hasFullChat: true });
  }
  async getFullChat(sessionId: string): Promise<FullChat | null> {
    const c = await mongoService.FullChat.findOne({ sessionId });
    if (!c) return null;
    const obj = c.toObject();
    return { ...obj, sessionId: obj.sessionId.toString() } as FullChat;
  }
  async createJob(type: string, payload: any): Promise<Job> {
    const j = new mongoService.Job({ type, payload });
    await j.save();
    return { ...j.toObject(), _id: j._id.toString() } as Job;
  }
  async getNextJob(): Promise<Job | null> {
    const j = await mongoService.Job.findOne({ status: "PENDING", deadLettered: false }).sort({ createdAt: 1 });
    return j ? ({ ...j.toObject(), _id: j._id.toString() } as Job) : null;
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
  async clearJobs() {
    await mongoService.Job.deleteMany({});
  }
}

class DockerGraphStore implements IGraphStore {
  async saveTriple(t: any) {
    await neo4jService.saveTriple(t.subject, t.subjectType, t.relation, t.object, t.objectType, t.sessionId);
  }
  async getTriplesBySession(sessionId: string): Promise<Triple[]> {
    const triples = await neo4jService.getTriplesBySession(sessionId);
    return triples.map((t: any) => ({
      subject: t.subject,
      subjectType: t.subjectType || "Entity",
      relation: t.relation,
      object: t.object,
      objectType: t.objectType || "Entity",
      sessionId: sessionId,
      timestamp: t.timestamp || new Date().toISOString()
    } as Triple));
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
               r.type AS relation,
               o.name AS target, o.type AS targetType
        LIMIT $limit
      `;

      const result = await session.run(query, params);
      const nodes = new Map<string, any>();
      const links: any[] = [];

      result.records.forEach((rec) => {
        const src = rec.get("source");
        const tgt = rec.get("target");
        if (!nodes.has(src)) nodes.set(src, { id: src, type: rec.get("sourceType") });
        if (!nodes.has(tgt)) nodes.set(tgt, { id: tgt, type: rec.get("targetType") });
        links.push({ source: src, target: tgt, relation: rec.get("relation") });
      });

      return { nodes: Array.from(nodes.values()), links };
    } finally {
      await session.close();
    }
  }

  async deleteTriplesBySession(sessionId: string): Promise<void> {
    const session = neo4jService.getDriver().session();
    try {
      await session.run(
        `MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity) DELETE r`,
        { sessionId }
      );
    } finally {
      await session.close();
    }
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
  async deleteChunksBySession(sessionId: string) {
    await chromaService.deleteChunksBySession(sessionId);
  }
}

let sessionStore: ISessionStore;
let graphStore: IGraphStore;
let vectorStore: IVectorStore;

if (STORAGE_MODE === "sqlite") {
  logger.info("Initializing Synq in SQLITE mode (Zero-Docker)");
  sessionStore = new SqliteSessionStore();
  graphStore = new SqliteGraphStore();
  vectorStore = new SqliteVectorStore();
} else {
  logger.info("Initializing Synq in DOCKER mode (Mongo/Neo4j/Chroma)");
  sessionStore = new DockerSessionStore();
  graphStore = new DockerGraphStore();
  vectorStore = new DockerVectorStore();
}

export { sessionStore, graphStore, vectorStore };
