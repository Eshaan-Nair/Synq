"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectNeo4j = connectNeo4j;
exports.getDriver = getDriver;
exports.saveTriple = saveTriple;
exports.getTriplesBySession = getTriplesBySession;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const logger_1 = require("../utils/logger");
let driver;
async function connectNeo4j() {
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 2000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            driver = neo4j_driver_1.default.driver(process.env.NEO4J_URI, neo4j_driver_1.default.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD));
            await driver.verifyConnectivity();
            logger_1.logger.success("Neo4j connected");
            return;
        }
        catch (err) {
            const delay = BASE_DELAY_MS * attempt;
            if (attempt < MAX_RETRIES) {
                logger_1.logger.warn(`Neo4j not ready (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
            }
            else {
                logger_1.logger.error("Neo4j connection failed after all retries:", err);
                process.exit(1);
            }
        }
    }
}
function getDriver() {
    return driver;
}
async function saveTriple(subject, subjectType, relation, object, objectType, sessionId) {
    const session = driver.session();
    try {
        await session.run(`
      MERGE (s:Entity {name: $subject, type: $subjectType})
      MERGE (o:Entity {name: $object, type: $objectType})
      MERGE (s)-[r:RELATION {type: $relation, sessionId: $sessionId}]->(o)
      ON CREATE SET r.timestamp = $timestamp
      RETURN s, r, o
      `, {
            subject,
            subjectType,
            relation,
            object,
            objectType,
            sessionId,
            timestamp: new Date().toISOString(),
        });
    }
    finally {
        await session.close();
    }
}
async function getTriplesBySession(sessionId) {
    const session = driver.session();
    try {
        const result = await session.run(`
      MATCH (s:Entity)-[r:RELATION {sessionId: $sessionId}]->(o:Entity)
      RETURN s.name AS subject, s.type AS subjectType,
             r.type AS relation,
             o.name AS object, o.type AS objectType,
             r.timestamp AS timestamp
      ORDER BY r.timestamp ASC
      `, { sessionId });
        return result.records.map((rec) => ({
            subject: rec.get("subject"),
            subjectType: rec.get("subjectType"),
            relation: rec.get("relation"),
            object: rec.get("object"),
            objectType: rec.get("objectType"),
            timestamp: rec.get("timestamp"),
        }));
    }
    finally {
        await session.close();
    }
}
