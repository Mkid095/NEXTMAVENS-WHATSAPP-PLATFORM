/**
 * Step Failure Handler
 *
 * Handles step execution failures: retry logic or workflow failure.
 */

import type { WorkflowStepJobData } from '../types';
import { WorkflowStepStatus } from '../types';
import { resolveRetryPolicy, shouldRetry, calculateRetryDelay } from '../retry-policy';
import { addJob, MessageType, MessagePriority } from '../../message-queue-priority-system';
import { updateStepHistory } from './database.helpers';
import { emitStepEvent } from './websocket.handler';
import { resolveActionType } from './utils';

// Metrics (optional)
let workflowMetrics: any = null;
try {
  const metrics = require('../create-comprehensive-metrics-dashboard-(grafana)/index');
  workflowMetrics = {
    workflowInstancesTotal: metrics.workflowInstancesTotal,
    workflowStepsCompletedTotal: metrics.workflowStepsCompletedTotal,
    workflowStepsFailedTotal: metrics.workflowStepsFailedTotal,
    workflowCompensationsTriggeredTotal: metrics.workflowCompensationsTriggeredTotal,
    workflowDurationSeconds: metrics.workflowDurationSeconds,
    workflowStepDurationSeconds: metrics.workflowStepDurationSeconds
  };
} catch (err) {
  // Metrics not available
}

/**
 * Handle step execution failure
 *
 * Determines if the step should be retried or if the workflow should fail.
 * Throws errors to signal BullMQ for retry or final failure.
 */
export async function handleStepFailure(
  engine: any, // WorkflowEngine
  jobData: WorkflowStepJobData,
  instance: any,
  result: any, // StepExecutionResult
  job: any // BullMQ Job
): Promise<void> {
  const errorMsg = result.error ?? 'Unknown step error';
  console.error(`[WorkflowProcessor] Step ${jobData.stepIndex} (${jobData.stepName}) failed: ${errorMsg}`);

  // Record step failure
  await updateStepHistory(jobData.instanceId, jobData.stepIndex, WorkflowStepStatus.FAILED, errorMsg, result.output);

  // Determine retry policy
  const retryPolicy = resolveRetryPolicy(
    resolveActionType(jobData.action),
    jobData.retryPolicy,
    undefined
  );

  const shouldRetryStep = shouldRetry(job.attemptsMade + 1, new Error(errorMsg), retryPolicy);

  if (shouldRetryStep) {
    const delayMs = calculateRetryDelay(job.attemptsMade + 1, retryPolicy);
    console.log(`[WorkflowProcessor] Step will retry in ${delayMs}ms (attempt ${job.attemptsMade + 1}/${retryPolicy.maxAttempts})`);

    // Throw error with retry delay info - BullMQ will handle the retry
    const retryError = new Error(errorMsg);
    (retryError as any).retryIn = delayMs;
    throw retryError;
  } else {
    // Max retries exceeded or permanent error - fail the workflow
    console.log(`[WorkflowProcessor] Step failed permanently, failing workflow instance`);

    // Record failure metric
    if (workflowMetrics) {
      workflowMetrics.workflowStepsFailedTotal.inc({
        workflow_id: jobData.workflowId,
        step_name: jobData.stepName,
        error_category: 'permanent'
      });
    }

    // Fail the workflow (may trigger compensation)
    await engine.failWorkflow(jobData.instanceId, errorMsg, true);

    // Emit failure event
    emitStepEvent('workflow:step:failed', jobData, instance.orgId, {
      error: errorMsg,
      retryCount: job.attemptsMade,
      final: true
    });

    throw new Error(`Step failed permanently: ${errorMsg}`);
  }
}
