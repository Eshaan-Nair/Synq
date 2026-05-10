import { SqliteSessionStore } from "../sqlite-session";
import { SqliteGraphStore } from "../sqlite-graph";
import { SqliteVectorStore } from "../sqlite-vector";
import { initSqlite, getSqlite } from "../sqlite";
import * as embeddings from "../embeddings";

let uuidCounter = 0;
jest.mock("uuid", () => ({
  v4: () => `test-uuid-${++uuidCounter}`
}));

// Mock the embeddings service to avoid external API calls
jest.mock("../embeddings", () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
  generateEmbeddings: jest.fn().mockResolvedValue([new Array(768).fill(0.1)])
}));

describe("SQLite Storage Layer", () => {
  let db: any;
  let sessionStore: SqliteSessionStore;
  let graphStore: SqliteGraphStore;
  let vectorStore: SqliteVectorStore;

  beforeAll(() => {
    process.env.SQLITE_DB_PATH = "test.db";
    initSqlite();
    db = getSqlite();
    sessionStore = new SqliteSessionStore();
    graphStore = new SqliteGraphStore();
    vectorStore = new SqliteVectorStore();
  });

  describe("SqliteSessionStore", () => {
    let sessionId: string;

    it("should create a new session", async () => {
      const session = await sessionStore.createSession("Test Project", "chrome");
      expect(session.projectName).toBe("Test Project");
      expect(session._id).toBeDefined();
      sessionId = session._id;
    });

    it("should retrieve sessions", async () => {
      const sessions = await sessionStore.getSessions();
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].projectName).toBe("Test Project");
    });

    it("should handle active session state", async () => {
      await sessionStore.setActiveSessionId(sessionId);
      const active = await sessionStore.getActiveSessionId();
      expect(active).toBe(sessionId);
    });
  });

  describe("SqliteGraphStore", () => {
    let testSessionId: string;

    beforeAll(async () => {
        const session = await sessionStore.createSession("Graph Project", "chrome");
        testSessionId = session._id;
    });

    it("should save and retrieve triples", async () => {
      const triple = {
        subject: "Noob",
        subjectType: "Person",
        relation: "OWNS",
        object: "SplitSmart",
        objectType: "Project",
        sessionId: testSessionId,
        timestamp: new Date().toISOString()
      };

      await graphStore.saveTriple(triple);
      const triples = await graphStore.getTriplesBySession(testSessionId);
      expect(triples).toHaveLength(1);
      expect(triples[0].subject).toBe("Noob");
    });

    it("should find related triples by entities", async () => {
      const related = await graphStore.findRelatedTriples(["Noob"], testSessionId);
      expect(related).toHaveLength(1);
      expect(related[0].object).toBe("SplitSmart");
    });
  });

  describe("SqliteVectorStore", () => {
    let testSessionId: string;

    beforeAll(async () => {
        const session = await sessionStore.createSession("Vec Project", "chrome");
        testSessionId = session._id;
    });

    it("should store chunks and metadata", async () => {
      const chunks = [
        {
          id: "chunk-1",
          sessionId: testSessionId,
          chunkIndex: 0,
          content: "Synq is a local knowledge graph tool."
        }
      ];

      await vectorStore.storeChunks(chunks as any);
      
      // Verify metadata exists
      const meta = db.prepare("SELECT * FROM chunk_metadata WHERE sessionId = ?").get(testSessionId);
      expect(meta.content).toContain("Synq");
    });
  });
});
