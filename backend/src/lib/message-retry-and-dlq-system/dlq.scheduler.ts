/**
 * DLQ Scheduler
 *
 * Scheduled cleanup and maintenance tasks for DLQ.
 */

import { cleanOldDlqEntries } from './dlq';

/**
 * Schedule periodic cleanup of old DLQ entries
 * Call this during application startup
 */
export async function scheduleDlqCleanup(intervalHours: number = 6): Promise<() => Promise<void>> {
  console.log(`[DLQMaintenance] Scheduling DLQ cleanup every ${intervalHours} hours`);

  const cleanup = async () => {
    try {
      const count = await cleanOldDlqEntries();
      if (count > 0) {
        console.log(`[DLQMaintenance] Cleaned ${count} old DLQ entries`);
      }
    } catch (error) {
      console.error('[DLQMaintenance] Cleanup failed:', error);
    }
  };

  // Run immediately once
  await cleanup();

  // Schedule recurring cleanup
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const timer = setInterval(cleanup, intervalMs);

  // Return stop function
  return async () => {
    clearInterval(timer);
    console.log('[DLQMaintenance] Cleanup scheduler stopped');
  };
}
