/**
 * Workflow Orchestration Metrics (Phase 3 Step 3)
 */

import { Counter, Histogram } from 'prom-client';

/**
 * Total number of workflow instances created
 */
export const workflowInstancesTotal = new Counter({
  name: 'whatsapp_platform_workflow_instances_total',
  help: 'Total number of workflow instances created',
  labelNames: ['workflow_id', 'org_id', 'status'],
});

/**
 * Total number of workflow steps completed successfully
 */
export const workflowStepsCompletedTotal = new Counter({
  name: 'whatsapp_platform_workflow_steps_completed_total',
  help: 'Total number of workflow steps completed successfully',
  labelNames: ['workflow_id', 'step_name'],
});

/**
 * Total number of workflow steps that failed
 */
export const workflowStepsFailedTotal = new Counter({
  name: 'whatsapp_platform_workflow_steps_failed_total',
  help: 'Total number of workflow steps that failed',
  labelNames: ['workflow_id', 'step_name', 'error_category'],
});

/**
 * Total number of compensation flows triggered
 */
export const workflowCompensationsTriggeredTotal = new Counter({
  name: 'whatsapp_platform_workflow_compensations_triggered_total',
  help: 'Total number of compensation flows triggered',
  labelNames: ['workflow_id', 'trigger_reason'],
});

/**
 * Workflow execution duration from start to completion
 */
export const workflowDurationSeconds = new Histogram({
  name: 'whatsapp_platform_workflow_duration_seconds',
  help: 'Workflow execution duration from start to completion',
  labelNames: ['workflow_id', 'status'],
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
});

/**
 * Individual step execution duration
 */
export const workflowStepDurationSeconds = new Histogram({
  name: 'whatsapp_platform_workflow_step_duration_seconds',
  help: 'Individual step execution duration',
  labelNames: ['workflow_id', 'step_name'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
});
