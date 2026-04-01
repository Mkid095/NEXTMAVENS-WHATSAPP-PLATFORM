import { cleanOldDlqEntries } from './admin.operations';

/**
 * Schedule periodic DLQ cleanup
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

  await cleanup();

  const intervalMs = intervalHours * 60 * 60 * 1000;
  const timer = setInterval(cleanup, intervalMs);

  return async () => {
    clearInterval(timer);
    console.log('[DLQMaintenance] Cleanup scheduler stopped');
  };
}
