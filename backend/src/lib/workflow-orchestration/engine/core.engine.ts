/**
 * Workflow Engine - Core
 *
 * Main orchestration logic for managing workflow instances and step execution.
 * Delegates to specialized operation services.
 */

import type {
  WorkflowInstance,
  StartWorkflowOptions,
  StartWorkflowResult,
  WorkflowOperationResult,
  StepExecutionContext,
  StepExecutionResult
} from '../types';
import { WorkflowStatus as WorkflowStatusEnum } from '../types';
import { loadInstance } from './workflow-persistence.repository';

// Operation services
import {
  startWorkflow as startWorkflowImpl
} from './operations/starter.operations';
import {
  advanceStep as advanceStepImpl
} from './operations/advancer.operations';
import {
  failWorkflow as failWorkflowImpl,
  cancelWorkflow as cancelWorkflowImpl
} from './operations/terminator.operations';
import {
  checkWorkflowHealth as checkWorkflowHealthImpl
} from './operations/health.operations';

/**
 * WorkflowEngine - Core orchestration class
 * Thin facade that delegates to operation services.
 */
class WorkflowEngine {
  async startWorkflow(
    definitionId: string,
    orgId: string,
    options: StartWorkflowOptions = {}
  ): Promise<StartWorkflowResult> {
    return await startWorkflowImpl(definitionId, orgId, options);
  }

  async advanceStep(
    instanceId: string,
    stepResult?: StepExecutionResult
  ): Promise<WorkflowOperationResult> {
    return await advanceStepImpl(instanceId, stepResult);
  }

  async failWorkflow(
    instanceId: string,
    reason: string,
    shouldCompensate: boolean = true
  ): Promise<WorkflowOperationResult> {
    return await failWorkflowImpl(instanceId, reason, shouldCompensate);
  }

  async cancelWorkflow(
    instanceId: string,
    reason?: string
  ): Promise<WorkflowOperationResult> {
    return await cancelWorkflowImpl(instanceId, reason);
  }

  async getWorkflowStatus(instanceId: string): Promise<WorkflowInstance | null> {
    return loadInstance(instanceId);
  }

  async checkWorkflowHealth(instanceId: string, timeoutMs?: number): Promise<any> {
    return await checkWorkflowHealthImpl(instanceId, timeoutMs);
  }
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
