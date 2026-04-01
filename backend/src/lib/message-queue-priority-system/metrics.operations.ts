/**
 * Message Queue Priority System - Metrics & Maintenance Operations
 * Functions for monitoring and cleaning the queue
 */

import { messageQueue } from './queue.instance';

/**
 * Get current queue metrics
 */
export async function getQueueMetrics(): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  priorityRanges: Record<string, number>;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    messageQueue.getWaitingCount(),
    messageQueue.getActiveCount(),
    messageQueue.getCompletedCount(),
    messageQueue.getFailedCount(),
    messageQueue.getDelayedCount()
  ]);

  const jobs = await messageQueue.getJobs();
  const priorityRanges: Record<string, number> = {};
  for (const job of jobs) {
    const p = (job.opts.priority ?? 10).toString();
    priorityRanges[p] = (priorityRanges[p] ?? 0) + 1;
  }

  return { name: 'whatsapp-messages', waiting, active, completed, failed, delayed, priorityRanges };
}

/**
 * Clean old jobs from completed/failed sets
 */
export async function cleanOldJobs(ageHours: number = 24, batchSize: number = 1000): Promise<number> {
  // Clean completed and failed jobs. Return count of total deleted (not critical for now)
  await messageQueue.clean(ageHours * 60 * 60 * 1000, batchSize, 'completed');
  await messageQueue.clean(ageHours * 60 * 60 * 1000, batchSize, 'failed');
  return 0; // Placeholder - can be enhanced if needed
}
