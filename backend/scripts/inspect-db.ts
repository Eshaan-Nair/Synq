import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.join(__dirname, "../glia.db"));
console.log("Sessions:", db.prepare("SELECT count(*) FROM sessions").get());
console.log("Chunks Metadata:", db.prepare("SELECT count(*) FROM chunk_metadata").get());
console.log("Vec Chunks:", db.prepare("SELECT count(*) FROM vec_chunks").get());

const sampleSession = db.prepare("SELECT * FROM sessions LIMIT 1").get() as any;
console.log("Sample Session ID:", sampleSession?.id);

const sampleMeta = db.prepare("SELECT * FROM chunk_metadata LIMIT 1").get() as any;
console.log("Sample Meta SessionID:", sampleMeta?.sessionId);
