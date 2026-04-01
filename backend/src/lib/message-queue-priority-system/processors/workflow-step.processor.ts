/**
 * Workflow Step Processor
 *
 * Handles WORKFLOW_STEP jobs - delegates to workflow orchestration.
 */

import type { Job } from 'bullmq';
import { processWorkflowStep } from '../../workflow-orchestration/processor';

/**
 * Process a workflow step job
 * Delegates to the workflow orchestration processor
 */
export async function processWorkflowStepJob(job: Job): Promise<void> {
  await processWorkflowStep(job);
}
