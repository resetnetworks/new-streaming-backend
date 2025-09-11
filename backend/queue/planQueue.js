import { Queue } from "bullmq";
import { processPlanCreation } from "../services/planService.js";

export const planQueue = new Queue("plan-queue");

export const enqueuePlanCreation = async (payload) => {
  await planQueue.add("create-plans", payload, { attempts: 3, backoff: 5000 });
};

// Worker
planQueue.process("create-plans", async (job) => {
  await processPlanCreation(job.data);
});
