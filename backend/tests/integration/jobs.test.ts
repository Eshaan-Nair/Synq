/**
 * jobs.test.ts — Unit Test for Background Job Service
 * 
 * Verifies the robustness of the job queue, retry logic, 
 * and dead-lettering (DLQ).
 */

import path from "path";
process.env.GLIA_STORAGE_MODE = process.env.GLIA_STORAGE_MODE || "sqlite";
if (process.env.GLIA_STORAGE_MODE === "sqlite") {
  process.env.SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(__dirname, "../../glia-jobs-test.db");
}

import { initStorage, sessionStore } from "../../src/services/storage";
import { processNextJob } from "../../src/services/jobs";

describe("Job Queue Service", () => {
  let testSessionId: string;

  beforeAll(async () => {
    await initStorage();
    await sessionStore.clearJobs(); // Clear any leftover jobs from previous tests
    const session = await sessionStore.createSession("Job Test Project", "claude");
    testSessionId = session._id.toString();
  }, 20000);

  afterAll(async () => {
    try {
      await sessionStore.deleteSession(testSessionId);
      await sessionStore.clearJobs();
    } catch {}

    // Clean up SQLite test db if we created one
    if (process.env.GLIA_STORAGE_MODE === "sqlite") {
      const fs = await import("fs");
      const dbPath = process.env.SQLITE_DB_PATH!;
      for (const ext of ["", "-shm", "-wal"]) {
        try { fs.unlinkSync(dbPath + ext); } catch {}
      }
    }
  });

  it("should dead-letter a job after 5 failed attempts", async () => {
    // 1. Create a job
    const job = await sessionStore.createJob("triple_extraction", { sessionId: testSessionId, chunks: [{ content: "fail me deliberately" }] });

    // 2. Process it 6 times, it will fail every time because LLM is unavailable in CI
    for (let i = 0; i < 6; i++) {
      await processNextJob();
    }

    // 3. Verify it's now dead-lettered
    const status = await sessionStore.getJobStatus();
    expect(status.deadLettered).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("should pick up pending jobs in order of creation", async () => {
    await sessionStore.clearJobs();
    
    await sessionStore.createJob("triple_extraction", { s: 1 });
    await new Promise(r => setTimeout(r, 10)); // Ensure different timestamp
    await sessionStore.createJob("triple_extraction", { s: 2 });

    const job = await sessionStore.getNextJob();
    expect(job?.payload.s).toBe(1);
  });
});
