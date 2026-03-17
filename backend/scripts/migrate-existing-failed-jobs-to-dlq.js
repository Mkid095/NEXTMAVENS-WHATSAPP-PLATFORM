#!/usr/bin/env node

/**
 * Migration Script: Move Existing Failed Jobs to DLQ
 *
 * This script migrates failed jobs from BullMQ's failed set to the new DLQ system.
 * Run this once after deploying the retry/DLQ system to migrate historical failures.
 *
 * Usage: node migrate-existing-failed-jobs-to-dlq.js
 *
 * Configuration via environment variables:
 * - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
 * - DLQ_STREAM_PREFIX (default: dlq:whatsapp)
 */

const Redis = require('ioredis');

// Configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const DLQ_STREAM_PREFIX = process.env.DLQ_STREAM_PREFIX || 'dlq:whatsapp';
const QUEUE_NAME = 'whatsapp-messages';

async function migrateFailedJobs() {
  console.log('[DLQMigration] Starting migration of failed jobs to DLQ...');
  console.log(`[DLQMigration] Redis: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`[DLQMigration] DLQ prefix: ${DLQ_STREAM_PREFIX}`);

  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD
  });

  try {
    // Test connection
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis connection failed');
    }
    console.log('[DLQMigration] Connected to Redis');

    // Get failed jobs from BullMQ
    // BullMQ stores failed jobs in keys: bull:<queue>:failed
    const failedKey = `bull:${QUEUE_NAME}:failed`;
    const failedCount = await redis.zcard(failedKey);
    console.log(`[DLQMigration] Found ${failedCount} failed jobs in BullMQ`);

    if (failedCount === 0) {
      console.log('[DLQMigration] No failed jobs to migrate');
      return;
    }

    // Get all failed job IDs
    const failedJobIds = await redis.zrange(failedKey, 0, -1);
    console.log(`[DLQMigration] Processing ${failedJobIds.length} failed jobs...`);

    let migrated = 0;
    let errors = 0;

    for (const jobId of failedJobIds) {
      try {
        // Get job data from Redis
        const jobKey = `bull:${QUEUE_NAME}:${jobId}`;
        const jobData = await redis.hgetall(jobKey);

        if (!jobData || Object.keys(jobData).length === 0) {
          console.warn(`[DLQMigration] Job ${jobId} data not found, skipping`);
          continue;
        }

        // Parse job data
        const { name: messageType, data, attemptsMade, failedReason, timestamp, opts } = jobData;

        let payload;
        try {
          payload = data ? JSON.parse(data) : {};
        } catch (e) {
          console.warn(`[DLQMigration] Job ${jobId} has invalid JSON data, skipping`);
          continue;
        }

        // Build DLQ metadata
        const metadata = {
          originalJobId: jobId,
          messageType: messageType || 'unknown',
          error: failedReason || 'Unknown error',
          errorCategory: classifyError(failedReason || 'Unknown'),
          retryCount: parseInt(attemptsMade || '0', 10),
          failedAt: timestamp ? new Date(parseInt(timestamp, 10) * 1000).toISOString() : new Date().toISOString(),
          payload,
          jobOptions: opts ? JSON.parse(opts) : undefined
        };

        // Add to DLQ stream
        const dlqStreamKey = `${DLQ_STREAM_PREFIX}:${metadata.messageType}`;
        await redis.xadd(
          dlqStreamKey,
          '*',
          'data',
          JSON.stringify(metadata),
          'timestamp',
          metadata.failedAt,
          'messageType',
          metadata.messageType,
          'errorCategory',
          metadata.errorCategory
        );

        migrated++;
        console.log(`[DLQMigration] Migrated job ${jobId} to DLQ (${metadata.messageType})`);

        // Progress log every a few jobs
        if (migrated % 100 === 0) {
          console.log(`[DLQMigration] Progress: ${migrated}/${failedJobIds.length}`);
        }

      } catch (error) {
        errors++;
        console.error(`[DLQMigration] Error migrating job ${jobId}:`, error.message);
      }
    }

    console.log(`\n[DLQMigration] Migration complete!`);
    console.log(`[DLQMigration] Migrated: ${migrated}`);
    console.log(`[DLQMigration] Errors: ${errors}`);
    console.log(`[DLQMigration] Remaining in failed set: ${failedCount - migrated}`);

    // Ask for confirmation to clear failed set
    // Comment out this section if you want to keep the failed set for safety
    /*
    console.log('\n[DLQMigration] Clearing BullMQ failed set...');
    await redis.del(failedKey);
    console.log('[DLQMigration] Cleared BullMQ failed set');
    */

  } finally {
    await redis.quit();
    console.log('[DLQMigration] Redis connection closed');
  }
}

function classifyError(errorMsg) {
  const msg = (errorMsg || '').toLowerCase();
  if (msg.includes('timeout')) return 'transient';
  if (msg.includes('deadlock')) return 'transient';
  if (msg.includes('connection')) return 'transient';
  if (msg.includes('unavailable')) return 'transient';
  if (msg.includes('validation')) return 'permanent';
  if (msg.includes('invalid')) return 'permanent';
  if (msg.includes('not found')) return 'permanent';
  return 'unknown';
}

// Run if called directly
if (process.argv[1] === __filename) {
  migrateFailedJobs()
    .then(() => {
      console.log('[DLQMigration] Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[DLQMigration] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { migrateFailedJobs };
