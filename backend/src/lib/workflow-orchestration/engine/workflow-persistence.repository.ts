/**
 * Workflow Persistence Repository - Barrel Export
 *
 * Re-exports all repository functions from specialized modules.
 *
 * Maintains backward compatibility by providing a single import point
 * for all persistence operations.
 */

// Definition operations
export {
  loadActiveDefinition
} from './workflow-definition.repository';

// Instance operations
export {
  loadInstance,
  createWorkflowInstance,
  updateInstanceStatus,
  completeWorkflow,
  failWorkflow,
  cancelWorkflow,
  setCurrentStep
} from './workflow-instance.repository';

// History operations
export {
  recordStepSkipped
} from './workflow-history.repository';
