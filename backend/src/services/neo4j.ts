import neo4j, { Driver } from "neo4j-driver";

let driver: Driver;

export async function connectNeo4j() {
  try {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
    );
    await driver.verifyConnectivity();
    console.log("✅ Neo4j connected");
  } catch (err) {
    console.error("❌ Neo4j connection failed:", err);
    process.exit(1);
  }
}

export function getDriver(): Driver {
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
  const session = driver.session();
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
  const session = driver.session();
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