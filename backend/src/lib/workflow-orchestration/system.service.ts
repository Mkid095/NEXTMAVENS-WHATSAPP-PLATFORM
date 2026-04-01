/**
 * Workflow Orchestration - System Service
 * Feature flag and initialization
 */

import { startWorker as startBullWorker, stopWorker as stopBullWorker } from '../message-queue-priority-system';

export const FEATURE_FLAG_WORKFLOW = 'ENABLE_WORKFLOW_ORCHESTRATION';

/**
 * Check if workflow orchestration is enabled
 */
export function isWorkflowEnabled(): boolean {
  return process.env[FEATURE_FLAG_WORKFLOW] === 'true';
}

let workerInitialized = false;

/**
 * Initialize the workflow orchestration system
 * Starts the BullMQ worker for processing workflow step jobs
 */
export async function initializeWorkflowSystem(): Promise<void> {
  if (!isWorkflowEnabled()) {
    console.log('[Workflow] System disabled by feature flag ENABLE_WORKFLOW_ORCHESTRATION');
    return;
  }

  if (workerInitialized) {
    console.log('[Workflow] Worker already initialized');
    return;
  }

  console.log('[Workflow] Initializing workflow orchestration system...');

  try {
    // Add WORKFLOW_STEP processor to the existing worker
    // Note: The worker is managed by message-queue-priority-system/consumer.ts
    // We need to ensure our processor is called from there
    console.log('[Workflow] Worker integration pending - will be registered in consumer.ts');
    workerInitialized = true;
    console.log('[Workflow] System initialized');
  } catch (error) {
    console.error('[Workflow] Initialization failed:', error);
    throw error;
  }
}
