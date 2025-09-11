import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { deleteFromS3 } from "./s3Uploader.js";

const connection = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

// Create song deletion queue
export const songDeletionQueue = new Queue("songDeletionQueue", { connection });

// Worker to process S3 deletions
export const songDeletionWorker = new Worker(
  "songDeletionQueue",
  async (job) => {
    const { audioUrl, coverImage } = job.data;

    const deletions = [];
    if (audioUrl) deletions.push(deleteFromS3(audioUrl));
    if (coverImage) deletions.push(deleteFromS3(coverImage));

    await Promise.all(deletions);
    console.log(`✅ Deleted files for job ${job.id}`);
  },
  { connection }
);

songDeletionWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err);
});
