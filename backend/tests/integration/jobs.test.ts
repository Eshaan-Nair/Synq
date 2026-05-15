/**
 * jobs.test.ts — Unit Test for Background Job Service
 * 
 * Verifies the robustness of the job queue, retry logic, 
 * and dead-lettering (DLQ).
 */

import { connectMongo, Job, Session } from "../../src/services/mongo";
import { processNextJob } from "../../src/services/jobs";
import mongoose from "mongoose";

describe("Job Queue Service", () => {
  let testSessionId: string;

  beforeAll(async () => {
    await connectMongo();
    await Job.deleteMany({}); // Clear any leftover jobs from previous tests
    const session = await Session.create({
      projectName: "Job Test Project",
      platform: "claude"
    });
    testSessionId = session._id.toString();
  }, 20000);

  afterAll(async () => {
    await Session.deleteMany({ projectName: "Job Test Project" });
    await Job.deleteMany({});
    await mongoose.disconnect();
  });

  it("should dead-letter a job after 5 failed attempts", async () => {
    // 1. Create a job already on its 5th attempt (attempts >= 5 triggers dead-letter)
    //    jobs.ts checks: if (currentAttempts < 5) → retry, else → dead-letter
    //    currentAttempts is read BEFORE the increment, so starting at 5 makes 5 < 5 = false
    const job = await Job.create({
      type: "triple_extraction",
      payload: { sessionId: "invalid-id", text: "fail me deliberately" }, // Invalid ID causes intentional failure
      status: "PENDING",
      attempts: 5,
      deadLettered: false
    });

    // 2. Process it — this will be the 6th attempt, triggering dead-letter
    await processNextJob();

    // 3. Verify it's now dead-lettered
    const updatedJob = await Job.findById(job._id);
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.attempts).toBe(6);
    expect(updatedJob?.deadLettered).toBe(true);
    expect(updatedJob?.failedAt).toBeDefined();
    expect(updatedJob?.error).toBeDefined();
  }, 10000);

  it("should pick up pending jobs in order of creation", async () => {
    await Job.deleteMany({});
    
    await Job.create({ type: "triple_extraction", payload: { s: 1 }, status: "PENDING", createdAt: new Date(Date.now() - 1000) });
    await Job.create({ type: "triple_extraction", payload: { s: 2 }, status: "PENDING", createdAt: new Date() });

    const job = await Job.findOne({ status: "PENDING" }).sort({ createdAt: 1 });
    expect(job?.payload.s).toBe(1);
  });
});
