import * as dotenv from "dotenv";
dotenv.config(); // MUST BE FIRST

import { sessionStore, graphStore, initStorage } from "../services/storage";

const TYPES = [
  "Person", "Technology", "Framework", "Concept", "Architecture", 
  "Database", "API", "Tool", "Project", "Decision", "Bug", "Feature",
  "Library", "Algorithm", "Pattern", "Organization"
];

const RELATIONS = [
  "USES", "DEPENDS_ON", "IMPLEMENTS", "FIXES", "BUILT_WITH", 
  "MEMBER_OF", "PART_OF", "DEFINES", "SOLVES", "CONTRIBUTED_BY"
];

async function run() {
  console.log("==========================================");
  console.log("   GLIA STRESS TEST GENERATOR (v1.4.7)");
  console.log("==========================================\n");

  try {
    await initStorage();
    
    const projectName = "STRESS TEST (1000+ Nodes)";
    console.log(`Creating session: "${projectName}"...`);
    
    // 1. Create the session
    const session = await sessionStore.createSession(projectName, "stress-test");
    const sid = session._id;

    console.log(`Session created (ID: ${sid}). Generating 1200 triples...`);

    const hubs = [
      { name: "Glia-AI", type: "Project" },
      { name: "React", type: "Framework" },
      { name: "Ollama", type: "Technology" },
      { name: "SQLite", type: "Database" },
      { name: "Node.js", type: "Technology" }
    ];

    let count = 0;

    const save = async (s: string, st: string, r: string, o: string, ot: string) => {
      await graphStore.saveTriple({
        subject: s,
        subjectType: st,
        relation: r,
        object: o,
        objectType: ot,
        sessionId: sid,
        timestamp: new Date().toISOString()
      });
      count++;
    };

    // 2. Generate Hubs (highly connected)
    for (const hub of hubs) {
      for (let i = 0; i < 40; i++) {
        const targetName = `Dependency-${hub.name}-${i}`;
        const targetType = TYPES[Math.floor(Math.random() * TYPES.length)];
        const rel = RELATIONS[Math.floor(Math.random() * RELATIONS.length)];
        await save(hub.name, hub.type, rel, targetName, targetType);
      }
    }

    // 3. Generate Intermediate Clusters
    for (let i = 0; i < 15; i++) {
      const clusterRoot = `Module-${i}`;
      const rootType = "Architecture";
      for (let j = 0; j < 20; j++) {
        const targetName = `Subcomponent-${i}-${j}`;
        const targetType = TYPES[Math.floor(Math.random() * TYPES.length)];
        await save(clusterRoot, rootType, "PART_OF", targetName, targetType);

        // Randomly connect subcomponent back to a hub
        if (Math.random() > 0.7) {
          const hub = hubs[Math.floor(Math.random() * hubs.length)];
          await save(targetName, targetType, "USES", hub.name, hub.type);
        }
      }
    }

    // 4. Generate Random Mesh
    for (let i = 0; i < 400; i++) {
      const sub = `Entity-A-${i}`;
      const obj = `Entity-B-${i}`;
      const st = TYPES[Math.floor(Math.random() * TYPES.length)];
      const ot = TYPES[Math.floor(Math.random() * TYPES.length)];
      const rel = RELATIONS[Math.floor(Math.random() * RELATIONS.length)];
      await save(sub, st, rel, obj, ot);
    }

    // 5. Generate "Orphans" (to test cohesion physics)
    for (let i = 0; i < 100; i++) {
      await save(`Standalone-Fact-${i}`, TYPES[Math.floor(Math.random() * TYPES.length)], "DEFINES", `Isolated-Concept-${i}`, "Concept");
    }

    // Update session triple count
    await sessionStore.updateSession(sid, { tripleCount: count });

    console.log(`\n✅ SUCCESS! Generated ${count} triples.`);
    console.log(`Open the dashboard and select "${projectName}" to test lag.`);
    process.exit(0);

  } catch (err) {
    console.error("Stress test failed:", err);
    process.exit(1);
  }
}

run();
