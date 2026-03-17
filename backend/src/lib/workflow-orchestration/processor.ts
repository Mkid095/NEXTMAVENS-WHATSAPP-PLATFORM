/**
 * Workflow Step Processor
 * BullMQ worker processor for WORKFLOW_STEP jobs
 */

import { Job } from 'bullmq';
import { prisma } from '../prisma';
import { getSocketService } from '../build-real-time-messaging-with-socket.io';
import { getWorkflowEngine } from './engine';
import { resolveRetryPolicy, shouldRetry, calculateRetryDelay } from './retry-policy';
import {
  WorkflowStepJobData,
  StepExecutionContext,
  StepExecutionResult,
  WorkflowStepStatus
} from './types';
import { addJob, MessageType } from '../message-queue-priority-system';
import { MessagePriority } from '../message-queue-priority-system/types';

// Import metrics (optional)
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
  // Metrics not available yet
}

// ============================================================================
// Main Job Processor
// ============================================================================

/**
 * Process a workflow step job
 * This is the main entry point called by the BullMQ worker
 */
export async function processWorkflowStep(job: Job): Promise<void> {
  const startTime = Date.now();
  const jobData = job.data as WorkflowStepJobData;

  console.log(`[WorkflowProcessor] Processing step job ${job.id} for instance ${jobData.instanceId}`);

  try {
    // Load instance and definition
    const engine = getWorkflowEngine();
    const instance = await engine['loadInstance'](jobData.instanceId);

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
    const context: StepExecutionContext = {
      instanceId: jobData.instanceId,
      workflowId: jobData.workflowId,
      stepIndex: jobData.stepIndex,
      stepName: jobData.stepName,
      context: jobData.context,
      orgId: jobData.orgId,
      executionCount: job.attemptsMade
    };

    // Execute the step
    const result = await executeStep(jobData.action, context, instance);

    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      // Step succeeded
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
    } else {
      // Step failed
      const errorMsg = result.error ?? 'Unknown step error';
      console.error(`[WorkflowProcessor] Step ${jobData.stepIndex} (${jobData.stepName}) failed: ${errorMsg}`);

      // Record step failure
      await updateStepHistory(jobData.instanceId, jobData.stepIndex, WorkflowStepStatus.FAILED, errorMsg, result.output);

      // Determine if we should retry or fail the workflow
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
  } catch (error: any) {
    // Unexpected processor error
    console.error(`[WorkflowProcessor] Unexpected error processing job ${job.id}:`, error);
    throw error; // Re-throw so BullMQ handles it
  }
}

// ============================================================================
// Step Execution
// ============================================================================

/**
 * Execute a step's action
 *
 * @param action - Step action configuration
 * @param context - Execution context
 * @param instance - Workflow instance
 * @returns Step execution result
 */
async function executeStep(
  action: { type: string; config: Record<string, unknown> },
  context: StepExecutionContext,
  instance: any
): Promise<StepExecutionResult> {
  const { type, config } = action;

  console.log(`[WorkflowProcessor] Executing action type: ${type} for step ${context.stepName}`);

  switch (type) {
    case 'message':
      return await executeMessageAction(config, context);

    case 'api-call':
      return await executeApiCallAction(config, context);

    case 'queue-job':
      return await executeQueueJobAction(config, context);

    case 'delay':
      return await executeDelayAction(config, context);

    case 'custom':
      return await executeCustomAction(config, context);

    case 'parallel':
      // Future: implement parallel step execution
      throw new Error('Parallel steps not yet implemented');

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

// --------------------------------------------------------------------------
// Action Implementations
// --------------------------------------------------------------------------

/**
 * Send a WhatsApp message (using existing message queue system)
 */
async function executeMessageAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { to, message, messageType = 'text' } = config;

  // Use existing message queue to send
  const { addJob } = await import('../message-queue-priority-system');
  const messageData = {
    chatId: to as string,
    instanceId: (context.context.instanceId as string) || (context.context as any).instanceId,
    orgId: context.orgId,
    from: context.context.from as string || 'unknown',
    to: to as string,
    type: messageType as string,
    content: message as any,
    timestamp: new Date().toISOString()
  };

  try {
    const job = await addJob(MessageType.MESSAGE_UPSERT, messageData, {
      priority: MessagePriority.MEDIUM
    });

    return {
      success: true,
      output: { jobId: job.id, messageQueued: true },
      metadata: { queuedAt: new Date().toISOString() }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to queue message: ${error.message}`
    };
  }
}

/**
 * Make an HTTP API call
 */
async function executeApiCallAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { url, method = 'POST', headers = {}, body } = config;

  try {
    const response = await fetch(url as string, {
      method: method as string,
      headers: headers as Record<string, string>,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const responseData = await response.json();

    return {
      success: true,
      output: { status: response.status, data: responseData },
      metadata: { url: url as string, method: method as string }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `API call error: ${error.message}`
    };
  }
}

/**
 * Add a job to the queue (generic)
 */
async function executeQueueJobAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { jobType, payload } = config;

  // Note: jobType should be a valid MessageType from the queue system
  const { addJob } = await import('../message-queue-priority-system');
  const validJobType = ['MESSAGE_UPSERT', 'MESSAGE_STATUS_UPDATE', 'INSTANCE_STATUS_UPDATE', 'ANALYTICS_EVENT'].includes(jobType as string)
    ? (jobType as any)
    : 'ANALYTICS_EVENT';

  try {
    const job = await addJob(validJobType as MessageType, payload as any, {
      priority: MessagePriority.MEDIUM
    });

    return {
      success: true,
      output: { jobId: job.id },
      metadata: { jobType: jobType as string }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to add queue job: ${error.message}`
    };
  }
}

/**
 * Delay execution (wait)
 */
async function executeDelayAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { delayMs } = config;

  if (typeof delayMs !== 'number') {
    throw new Error('Delay action requires delayMs in config');
  }

  // Delay execution
  await new Promise(resolve => setTimeout(resolve, delayMs));

  return {
    success: true,
    output: { delayedMs: delayMs },
    metadata: { delayedAt: new Date().toISOString() }
  };
}

/**
 * Execute custom action
 * Placeholder for custom step handlers
 */
async function executeCustomAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { handler, params } = config;

  // Custom handlers should be registered separately
  // For now, this is a placeholder that can be extended
  console.log(`[WorkflowProcessor] Custom action: ${handler}`, params);

  // Simulate success for now
  return {
    success: true,
    output: { handler, executed: true },
    metadata: { custom: true }
  };
}

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Ensure a step history entry exists for this execution (create if not)
 */
async function ensureStepHistoryEntry(jobData: WorkflowStepJobData): Promise<void> {
  try {
    await prisma.workflowStepHistory.create({
      data: {
        instanceId: jobData.instanceId,
        stepIndex: jobData.stepIndex,
        stepName: jobData.stepName,
        status: 'RUNNING',
        startedAt: new Date(),
        inputJson: jobData.context as any,
        metadata: {
          jobId: jobData.instanceId, // Actually job ID (BullMQ)
          executionCount: jobData.executionCount
        }
      }
    });
  } catch (error: any) {
    // If constraint fails (duplicate step index), it's okay - maybe retry
    if (error.code !== 'P2002') {
      throw error;
    }
    console.warn(`[WorkflowProcessor] Step history entry already exists for instance ${jobData.instanceId}, step ${jobData.stepIndex}`);
  }
}

/**
 * Update step history with completion/failure status
 */
async function updateStepHistory(
  instanceId: string,
  stepIndex: number,
  status: WorkflowStepStatus,
  errorMessage?: string,
  output?: Record<string, unknown>
): Promise<void> {
  const updateData: any = {
    status,
    completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED' ? new Date() : null,
    failedAt: status === 'FAILED' ? new Date() : null,
    errorMessage,
    outputJson: output
  };

  await prisma.workflowStepHistory.updateMany({
    where: {
      instanceId,
      stepIndex,
      status: 'RUNNING'
    },
    data: updateData
  });
}

// ============================================================================
// WebSocket Events
// ============================================================================

/**
 * Emit WebSocket event for step status change
 */
function emitStepEvent(
  event: string,
  jobData: WorkflowStepJobData,
  orgId: string,
  payload: Record<string, unknown>
): void {
  try {
    const socketService = getSocketService();
    if (!socketService) return;

    const eventData = {
      instanceId: jobData.instanceId,
      workflowId: jobData.workflowId,
      stepIndex: jobData.stepIndex,
      stepName: jobData.stepName,
      ...payload
    };

    // Emit to org room
    socketService.broadcastToOrg(orgId, event, eventData);

    console.log(`[WorkflowProcessor] Emitted ${event} for org ${orgId}`);
  } catch (err) {
    console.warn('[WorkflowProcessor] Failed to emit WebSocket event:', err.message);
  }
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Get action type string for retry policy lookup
 */
function resolveActionType(action: { type: string; config: Record<string, unknown> }): string {
  const { type, config } = action;

  if (type === 'message' && config.messageType === 'template') {
    return 'send-template';
  }
  if (type === 'message') {
    return 'send-message';
  }
  if (type === 'api-call' || type === 'queue-job') {
    return 'api-call';
  }

  return 'default';
}
