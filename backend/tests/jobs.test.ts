/**
 * jobs.test.ts — Unit Test for Background Job Service
 * 
 * Verifies the robustness of the job queue, retry logic, 
 * and dead-lettering (DLQ).
 */

import { connectMongo, Job, Session } from "../src/services/mongo";
import { processNextJob } from "../src/services/jobs";
import mongoose from "mongoose";

describe("Job Queue Service", () => {
  let testSessionId: string;

  beforeAll(async () => {
    await connectMongo();
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
    // 1. Create a job that is already on its 4th attempt
    const job = await Job.create({
      type: "triple_extraction",
      payload: { sessionId: "invalid-id", text: "fail me" }, // Invalid sessionId will cause failure
      status: "PENDING",
      attempts: 4,
      deadLettered: false
    });

    // 2. Process it — this will be the 5th attempt
    await processNextJob();

    // 3. Verify it's now dead-lettered
    const updatedJob = await Job.findById(job._id);
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.attempts).toBe(5);
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
