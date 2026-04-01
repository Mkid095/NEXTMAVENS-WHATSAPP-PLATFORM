/**
 * Step Success Handler
 *
 * Handles successful step execution: history update, metrics, advancement.
 */

import type { WorkflowStepJobData } from '../types';
import { WorkflowStepStatus } from '../types';
import { updateStepHistory } from './database.helpers';
import { emitStepEvent } from './websocket.handler';

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
 * Handle successful step execution
 */
export async function handleStepSuccess(
  engine: any, // WorkflowEngine
  jobData: WorkflowStepJobData,
  instance: any,
  result: any, // StepExecutionResult
  duration: number
): Promise<void> {
  console.log(`[WorkflowProcessor] Step ${jobData.stepIndex} (${jobData.stepName}) completed in ${duration}s`);

  // Record step completion in history
  await updateStepHistory(jobData.instanceId, jobData.stepIndex, WorkflowStepStatus.COMPLETED, null, result.output);

  // Emit WebSocket event
  emitStepEvent('workflow:step:completed', jobData, instance.orgId, { duration, output: result.output });

  // Record step duration metric
  if (workflowMetrics) {
    workflowMetrics.workflowStepDurationSeconds.observe(
      { workflow_id: jobData.workflowId, step_name: jobData.stepName },
      duration
    );
  }

  // Record step completion metric
  if (workflowMetrics) {
    workflowMetrics.workflowStepsCompletedTotal.inc({
      workflow_id: jobData.workflowId,
      step_name: jobData.stepName
    });
  }

  // Advance to next step
  await engine.advanceStep(jobData.instanceId, result);
}
