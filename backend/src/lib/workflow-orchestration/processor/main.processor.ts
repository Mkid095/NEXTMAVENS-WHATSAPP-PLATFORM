/**
 * Workflow Step Processor - Main
 *
 * BullMQ worker processor for WORKFLOW_STEP jobs.
 * Coordinates step execution and delegates to handlers.
 */

import { Job } from 'bullmq';
import { getWorkflowEngine } from '../engine';
import { loadInstance } from '../engine/workflow-persistence.repository';
import type { WorkflowStepJobData } from '../types';

// Import local modules
import { executeStep } from './step-executor';
import { ensureStepHistoryEntry } from './database.helpers';
import { handleStepSuccess } from './step-success.handler';
import { handleStepFailure } from './step-failure.handler';

/**
 * Build execution context from job data
 */
function buildExecutionContext(jobData: WorkflowStepJobData, job: Job) {
  return {
    instanceId: jobData.instanceId,
    workflowId: jobData.workflowId,
    stepIndex: jobData.stepIndex,
    stepName: jobData.stepName,
    context: jobData.context,
    orgId: jobData.orgId,
    executionCount: job.attemptsMade
  };
}

/**
 * Process a workflow step job
 * Main entry point called by the BullMQ worker
 */
export async function processWorkflowStep(job: Job): Promise<void> {
  const startTime = Date.now();
  const jobData = job.data as WorkflowStepJobData;

  console.log(`[WorkflowProcessor] Processing step job ${job.id} for instance ${jobData.instanceId}`);

  try {
    // Load instance and definition
    const engine = getWorkflowEngine();
    const instance = await loadInstance(jobData.instanceId);

    if (!instance) {
      throw new Error(`Workflow instance ${jobData.instanceId} not found`);
    }

    // Check if instance is still RUNNING (could have been cancelled)
    if (instance.status !== 'RUNNING') {
      console.log(`[WorkflowProcessor] Instance ${jobData.instanceId} is not RUNNING (${instance.status}), skipping step`);
      return;
    }

    // Record step start in history if not already recorded
    await ensureStepHistoryEntry(jobData);

    // Build execution context
    const context = buildExecutionContext(jobData, job);

    // Execute the step
    const result = await executeStep(jobData.action, context, instance);

    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      // Handle success
      await handleStepSuccess(engine, jobData, instance, result, duration);
    } else {
      // Handle failure (may throw)
      await handleStepFailure(engine, jobData, instance, result, job);
    }
  } catch (error: any) {
    // Unexpected processor error or intentional throw from failure handler
    console.error(`[WorkflowProcessor] Error processing job ${job.id}:`, error);
    throw error; // Re-throw so BullMQ handles it
  }
}
