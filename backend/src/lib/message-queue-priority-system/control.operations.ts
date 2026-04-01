/**
 * Message Queue Priority System - Control Operations
 * Queue lifecycle management
 */

import { messageQueue } from './queue.instance';

/**
 * Pause the queue (stop processing new jobs)
 */
export async function pauseQueue(): Promise<void> {
  await messageQueue.pause();
}

/**
 * Resume the queue (continue processing)
 */
export async function resumeQueue(): Promise<void> {
  await messageQueue.resume();
}

/**
 * Shutdown the queue gracefully
 */
export async function shutdownQueue(): Promise<void> {
  await messageQueue.close();
}
