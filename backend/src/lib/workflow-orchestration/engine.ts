/**
 * Workflow Engine
 * Core orchestration logic for managing workflow instances and step execution
 */

import { prisma } from '../prisma';
import type {
  WorkflowInstance,
  WorkflowDefinition,
  WorkflowStep,
  StartWorkflowOptions,
  StartWorkflowResult,
  WorkflowOperationResult,
  WorkflowStatus,
  StepExecutionContext,
  StepExecutionResult
} from './types';
import { WorkflowStatus as WorkflowStatusEnum, WorkflowStepStatus } from './types';
import { enqueueWorkflowStep, generateInstanceId } from './queue';
import { resolveRetryPolicy } from './retry-policy';

// ============================================================================
// Workflow Engine Class
// ============================================================================

class WorkflowEngine {
  // ==========================================================================
  // Start a new workflow instance
  // ==========================================================================
  async startWorkflow(
    definitionId: string,
    orgId: string,
    options: StartWorkflowOptions = {}
  ): Promise<StartWorkflowResult> {
    console.log(`[WorkflowEngine] Starting workflow ${definitionId} for org ${orgId}`);

    // Load active workflow definition
    const definition = await this.loadActiveDefinition(definitionId);
    if (!definition) {
      throw new Error(`Workflow definition ${definitionId} not found or inactive`);
    }

    // Generate unique instance ID
    const instanceId = generateInstanceId();

    // Build initial context (merge definition defaults with provided)
    const initialContext = {
      ...(definition as any).initialContext ?? {},
      ...options.context
    };

    // Create workflow instance in database
    const instance = await prisma.workflowInstance.create({
      data: {
        id: crypto.randomUUID(),
        instanceId,
        definitionId: definition.id, // Use database ID of definition
        status: WorkflowStatusEnum.PENDING,
        currentStep: 0,
        contextJson: initialContext,
        orgId,
        startedAt: new Date()
      }
    });

    console.log(`[WorkflowEngine] Created instance ${instanceId} (id: ${instance.id})`);

    // Transition to RUNNING and enqueue first step
    await this.transitionInstanceStatus(instance.id, WorkflowStatusEnum.RUNNING, 'start');

    try {
      const firstStep = definition.steps[0];
      if (!firstStep) {
        throw new Error('Workflow has no steps defined');
      }

      // Enqueue first step
      await this.enqueueStep(instance.id, instanceId, definition, firstStep, 0, initialContext, options);

      return {
        instanceId,
        status: WorkflowStatusEnum.RUNNING,
        firstStepIndex: 0,
        message: `Workflow started successfully, first step enqueued`
      };
    } catch (error) {
      // If enqueue fails, mark instance as FAILED
      await prisma.workflowInstance.update({
        where: { id: instance.id },
        data: {
          status: WorkflowStatusEnum.FAILED,
          failedAt: new Date(),
          failureReason: `Failed to enqueue first step: ${error}`
        }
      });

      throw error;
    }
  }

  // ==========================================================================
  // Advance workflow to next step (called after step success)
  // ==========================================================================
  async advanceStep(
    instanceId: string,
    stepResult?: StepExecutionResult
  ): Promise<WorkflowOperationResult> {
    console.log(`[WorkflowEngine] Advancing instance ${instanceId}`);

    const instance = await this.loadInstance(instanceId);
    if (!instance) {
      return { success: false, error: 'Instance not found' };
    }

    // Validate instance is in RUNNING state
    if (instance.status !== 'RUNNING') {
      return { success: false, error: `Instance not in RUNNING state (current: ${instance.status})` };
    }

    const currentStepIndex = instance.currentStep ?? 0;
    const definition = instance.definition;
    const nextStepIndex = currentStepIndex + 1;

    // Check if there are more steps
    if (nextStepIndex >= definition.steps.length) {
      // Workflow completed successfully
      await this.completeWorkflow(instance.id);
      // Note: completeWorkflow sets status to COMPLETED
      return { success: true, instanceId, details: { reason: 'All steps completed' } };
    }

    // Get next step
    const nextStep = definition.steps[nextStepIndex];

    // Check if step is optional and condition not met
    if (nextStep.optional && nextStep.condition) {
      const shouldSkip = await this.evaluateCondition(nextStep.condition, instance.context);
      if (!shouldSkip) {
        // Skip this step, continue to next
        await this.recordStepSkipped(instance.id, nextStepIndex, nextStep.name);
        console.log(`[WorkflowEngine] Skipping step ${nextStepIndex} (${nextStep.name})`);
        return this.advanceStep(instanceId, stepResult);
      }
    }

    // Update current step index
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: { currentStep: nextStepIndex }
    });

    // Enqueue next step
    await this.enqueueStep(
      instance.id,
      instance.instanceId,
      definition,
      nextStep,
      nextStepIndex,
      instance.context,
      { retryPolicy: definition.retryPolicy }
    );

    console.log(`[WorkflowEngine] Enqueued step ${nextStepIndex} (${nextStep.name}) for instance ${instanceId}`);

    return { success: true, instanceId, details: { advancedTo: nextStepIndex } };
  }

  // ==========================================================================
  // Mark workflow as failed
  // ==========================================================================
  async failWorkflow(
    instanceId: string,
    reason: string,
    shouldCompensate: boolean = true
  ): Promise<WorkflowOperationResult> {
    console.log(`[WorkflowEngine] Failing instance ${instanceId}: ${reason}`);

    const instance = await this.loadInstance(instanceId);
    if (!instance) {
      return { success: false, error: 'Instance not found' };
    }

    // Update instance status to FAILED
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        status: WorkflowStatusEnum.FAILED,
        failedAt: new Date(),
        failureReason: reason
      }
    });

    console.log(`[WorkflowEngine] Instance ${instanceId} marked as FAILED`);

    // Trigger compensation if configured
    if (shouldCompensate && instance.definition.compensation) {
      console.log(`[WorkflowEngine] Triggering compensation for instance ${instanceId}`);
      // Note: compensation runs async - don't wait for it here
      // In a real implementation, we'd enqueue a compensation workflow or start it asynchronously
    }

    return { success: true, instanceId, details: { reason } };
  }

  // ==========================================================================
  // Cancel a running workflow
  // ==========================================================================
  async cancelWorkflow(instanceId: string, reason?: string): Promise<WorkflowOperationResult> {
    console.log(`[WorkflowEngine] Cancelling instance ${instanceId}`);

    const instance = await this.loadInstance(instanceId);
    if (!instance) {
      return { success: false, error: 'Instance not found' };
    }

    if (!['PENDING', 'RUNNING'].includes(instance.status)) {
      return { success: false, error: `Cannot cancel instance in ${instance.status} state` };
    }

    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        status: WorkflowStatusEnum.CANCELLED,
        completedAt: new Date(),
        failureReason: reason ?? 'Cancelled by user'
      }
    });

    console.log(`[WorkflowEngine] Instance ${instanceId} cancelled`);

    return { success: true, instanceId, details: { reason: 'Cancelled' } };
  }

  // ==========================================================================
  // Complete a workflow
  // ==========================================================================
  async completeWorkflow(instanceId: string): Promise<void> {
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: {
        status: WorkflowStatusEnum.COMPLETED,
        completedAt: new Date(),
        currentStep: null
      }
    });
    console.log(`[WorkflowEngine] Instance ${instanceId} completed`);
  }

  // ==========================================================================
  // Get workflow status
  // ==========================================================================
  async getWorkflowStatus(instanceId: string): Promise<WorkflowInstance | null> {
    return this.loadInstance(instanceId);
  }

  // ==========================================================================
  // Health check for stuck workflows
  // ==========================================================================
  async checkWorkflowHealth(instanceId: string, timeoutMs?: number): Promise<any> {
    const instance = await this.loadInstance(instanceId);
    if (!instance) {
      return { healthy: false, reason: 'not_found' };
    }

    const issues: string[] = [];
    const now = new Date();

    // Check if workflow is stuck in RUNNING for too long
    if (instance.status === 'RUNNING') {
      const runningTime = now.getTime() - instance.startedAt.getTime();
      const effectiveTimeout = timeoutMs ?? (instance.definition.timeoutMs ?? 3600000); // 1 hour default

      if (runningTime > effectiveTimeout) {
        issues.push(`Workflow exceeded timeout (${runningTime}ms > ${effectiveTimeout}ms)`);
      }
    }

    // Check last heartbeat (if used)
    if (instance.lastHeartbeatAt) {
      const heartbeatAge = now.getTime() - instance.lastHeartbeatAt.getTime();
      if (heartbeatAge > 60000) { // 1 minute
        issues.push(`stale`);
      }
    }

    return {
      instanceId: instance.instanceId,
      healthy: issues.length === 0,
      reason: issues.length > 0 ? issues[0] : undefined,
      status: instance.status,
      currentStep: instance.currentStep,
      lastHeartbeatAt: instance.lastHeartbeatAt
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private async loadActiveDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    const def = await prisma.workflowDefinition.findFirst({
      where: {
        workflowId,
        isActive: true
      }
    });

    if (!def) return null;

    return {
      ...def,
      steps: def.stepsJson as any[],
      compensation: def.compensationJson as any | undefined,
      retryPolicy: def.retryPolicyJson as any | undefined
    };
  }

  private async loadInstance(instanceId: string): Promise<WorkflowInstance | null> {
    const instance = await prisma.workflowInstance.findFirst({
      where: { instanceId }, // Search by the unique instanceId string (not database PK)
      include: {
        definition: true
      },
      orderBy: { startedAt: 'desc' }
    });

    if (!instance) return null;

    // Load step history
    const history = await prisma.workflowStepHistory.findMany({
      where: { instanceId: instance.id },
      orderBy: [
        { stepIndex: 'asc' },
        { startedAt: 'asc' }
      ]
    });

    return {
      id: instance.id,
      instanceId: instance.instanceId,
      definitionId: instance.definitionId,
      status: instance.status as WorkflowStatus,
      currentStep: instance.currentStep,
      context: instance.contextJson as Record<string, unknown>,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      failedAt: instance.failedAt,
      failureReason: instance.failureReason,
      lastHeartbeatAt: instance.lastHeartbeatAt,
      orgId: instance.orgId,
      definition: {
        id: instance.definition.id,
        workflowId: instance.definition.workflowId,
        name: instance.definition.name,
        description: instance.definition.description,
        version: instance.definition.version,
        steps: instance.definition.stepsJson as any[],
        compensation: instance.definition.compensationJson as any,
        timeoutMs: instance.definition.timeoutMs,
        retryPolicy: instance.definition.retryPolicyJson as any,
        isActive: instance.definition.isActive,
        createdBy: instance.definition.createdBy,
        createdAt: instance.definition.createdAt,
        updatedAt: instance.definition.updatedAt
      },
      stepsHistory: history.map(h => ({
        id: h.id,
        instanceId: h.instanceId,
        stepIndex: h.stepIndex,
        stepName: h.stepName,
        status: h.status as WorkflowStepStatus,
        startedAt: h.startedAt,
        completedAt: h.completedAt,
        failedAt: h.failedAt,
        errorMessage: h.errorMessage,
        retryCount: h.retryCount,
        input: h.inputJson as Record<string, unknown> | undefined,
        output: h.outputJson as Record<string, unknown> | undefined,
        metadata: h.metadata as Record<string, unknown> | undefined
      }))
    };
  }

  private async enqueueStep(
    instanceDbId: string,
    instanceId: string,
    definition: WorkflowDefinition,
    step: WorkflowStep,
    stepIndex: number,
    context: Record<string, unknown>,
    options: StartWorkflowOptions
  ): Promise<void> {
    // Determine retry policy for this step
    const stepType = resolveStepType(step.action);
    const retryPolicy = resolveRetryPolicy(
      stepType,
      step.retryPolicy,
      options.retryPolicy ?? definition.retryPolicy
    );

    // Create step execution context
    const stepContext: StepExecutionContext = {
      instanceId,
      workflowId: definition.workflowId,
      stepIndex,
      stepName: step.name,
      context,
      orgId: (context as any).orgId || 'unknown',
      executionCount: 0
    };

    // Prepare job data
    const jobData:any = {
      type: 'WORKFLOW_STEP',
      instanceId: instanceDbId,
      workflowId: definition.workflowId,
      stepIndex,
      stepName: step.name,
      context,
      orgId: stepContext.orgId,
      executionCount: 0,
      action: step.action,
      retryPolicy
    };

    // Enqueue with appropriate priority and potential delay
    await enqueueWorkflowStep(jobData, {
      priority: mapStepPriority(step.priority),
      delayMs: step.action.type === 'delay' ? (step.action.config.delayMs as number) : undefined
    });

    console.log(`[WorkflowEngine] Enqueued step ${stepIndex} (${step.name}) for instance ${instanceId}`);
  }

  private async transitionInstanceStatus(
    instanceId: string,
    status: WorkflowStatus,
    reason?: string
  ): Promise<void> {
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { status }
    });
    console.log(`[WorkflowEngine] Instance ${instanceId} status -> ${status}${reason ? ` (${reason})` : ''}`);
  }

  private async recordStepSkipped(
    instanceId: string,
    stepIndex: number,
    stepName: string
  ): Promise<void> {
    await prisma.workflowStepHistory.create({
      data: {
        instanceId,
        stepIndex,
        stepName,
        status: WorkflowStepStatus.SKIPPED,
        startedAt: new Date(),
        completedAt: new Date(),
        metadata: { reason: 'condition_not_met' }
      }
    });
  }

  private async evaluateCondition(
    condition: { expression: string },
    context: Record<string, unknown>
  ): Promise<boolean> {
    // WARNING: Using eval is dangerous. In production, use a safe expression evaluator like "filtrex" or "jsep"
    // For now, we'll implement a very restricted evaluator or use Function constructor with limited scope
    try {
      // Create a function with access only to context
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', `return ${condition.expression}`);
      return fn(context);
    } catch (error) {
      console.error(`[WorkflowEngine] Condition evaluation error:`, error);
      return false;
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function resolveStepType(action: { type: string; config: Record<string, unknown> }): string {
  // This mirrors the logic in retry-policy.ts.getStepTypeFromAction
  const { type, config } = action;

  switch (type) {
    case 'message':
      const messageType = config.messageType as string | undefined;
      if (messageType === 'template') return 'send-template';
      return 'send-message';

    case 'api-call':
    case 'queue-job':
      return 'api-call';

    case 'custom':
    case 'delay':
    case 'parallel':
    default:
      return 'default';
  }
}

function mapStepPriority(priority?: 'low' | 'normal' | 'high' | 'critical'): 'low' | 'normal' | 'high' | 'critical' {
  return priority ?? 'normal';
}

// ============================================================================
// Health Check (exported for testing and standalone use)
// ============================================================================

/**
 * Check health of a workflow instance
 *
 * @param instanceId - Workflow instance ID
 * @param timeoutMs - Optional timeout threshold (default from definition)
 * @returns Health status
 */
export async function checkWorkflowHealth(
  instanceId: string,
  timeoutMs?: number
): Promise<any> {
  const engine = getWorkflowEngine();
  return engine.checkWorkflowHealth(instanceId, timeoutMs);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let engineInstance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!engineInstance) {
    engineInstance = new WorkflowEngine();
  }
  return engineInstance;
}

// Re-export for convenience
export { WorkflowEngine };
