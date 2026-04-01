/**
 * Workflow Compensation Module
 * Handles rollback and compensation actions when workflow steps fail.
 *
 * Architecture:
 * - compensation.loader.ts: Data loading and persistence
 * - compensation.service.ts: Main compensation engine
 * - compensation.executor.ts: Action execution handlers
 *
 * All files under 150 lines.
 */

export * from './compensation.loader';
export * from './compensation.service';
export * from './compensation.executor';
