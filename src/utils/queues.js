/**
 * Shared BullMQ queue producers.
 *
 * These queues are consumed by the workers in src/workers/.
 * Keeping the producer definitions in one place avoids duplicate Queue
 * declarations across handlers and workers.
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const albumProcessingQueue = new Queue('albumProcessing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: {
      age: 2 * 24 * 3600, // keep failed jobs for 2 days
    },
  },
});

const socialPostingQueue = new Queue('socialPosting', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: {
      age: 4 * 3600, // remove failed jobs after 4 hours
    },
  },
});

module.exports = {
  redisConnection,
  albumProcessingQueue,
  socialPostingQueue,
};
