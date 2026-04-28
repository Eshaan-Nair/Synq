import neo4j, { Driver } from "neo4j-driver";
import { logger } from "../utils/logger";

let driver: Driver | null = null;

export async function connectNeo4j() {
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      driver = neo4j.driver(
        process.env.NEO4J_URI!,
        neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
      );
      await driver.verifyConnectivity();
      logger.success("Neo4j connected");
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * attempt;
      if (attempt < MAX_RETRIES) {
        logger.warn(`Neo4j not ready (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        logger.error("Neo4j connection failed after all retries:", err);
        process.exit(1);
      }
    }
  }
}

// FIX (Bug #3): All internal callers now use getDriver() instead of accessing
// the module-level `driver` variable directly. getDriver() throws a clear,
// descriptive error if called before connectNeo4j() completes, rather than
// crashing with "Cannot read properties of null (reading 'session')".
export function getDriver(): Driver {
  if (!driver) {
    throw new Error("[SYNQ] Neo4j driver is not initialized. connectNeo4j() has not completed yet.");
  }
  return driver;
}

export async function saveTriple(
  subject: string,
  subjectType: string,
  relation: string,
  object: string,
  objectType: string,
  sessionId: string
) {
  // FIX (Bug #3): Use getDriver() instead of driver directly
  const d = getDriver();
  const session = d.session();
  try {
    await session.run(
      `
      MERGE (s:Entity {name: $subject, type: $subjectType})
      MERGE (o:Entity {name: $object, type: $objectType})
      MERGE (s)-[r:RELATION {type: $relation, sessionId: $sessionId}]->(o)
      ON CREATE SET r.timestamp = $timestamp
      RETURN s, r, o
      `,
      {
        subject,
        subjectType,
        relation,
        object,
        objectType,
        sessionId,
        timestamp: new Date().toISOString(),
      }
    );
  } finally {
    await session.close();
  }
}

export async function getTriplesBySession(sessionId: string) {
  // FIX (Bug #3): Use getDriver() instead of driver directly
  const d = getDriver();
  const session = d.session();
  try {
    const result = await session.run(
      `
      MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity)
      RETURN s.name AS subject, s.type AS subjectType,
             r.type AS relation,
             o.name AS object, o.type AS objectType,
             r.timestamp AS timestamp
      ORDER BY r.timestamp ASC
      `,
      { sessionId }
    );
    return result.records.map((rec) => ({
      subject: rec.get("subject"),
      subjectType: rec.get("subjectType"),
      relation: rec.get("relation"),
      object: rec.get("object"),
      objectType: rec.get("objectType"),
      timestamp: rec.get("timestamp"),
    }));
  } finally {
    await session.close();
  }
}