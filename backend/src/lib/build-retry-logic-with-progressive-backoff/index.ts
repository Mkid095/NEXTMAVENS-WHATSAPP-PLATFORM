/**
 * Build Retry Logic with Progressive Backoff
 * Provides utilities for executing operations with automatic retries and exponential backoff.
 *
 * Features:
 * - Configurable retry policies (max attempts, delays, backoff factor)
 * - Jitter to prevent thundering herd
 * - Custom retry predicate
 * - In-memory policy store for CRUD management
 */

import { randomUUID } from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for retry behavior
 */
export interface RetryPolicy {
  /** Unique identifier */
  id: string;
  /** Human-readable name (optional) */
  name?: string;
  /** Maximum number of attempts (must be >= 1) */
  maxAttempts: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Backoff multiplier (e.g., 2 = doubling) */
  backoffFactor: number;
  /** Maximum delay between retries (cap) */
  maxDelayMs: number;
}

/**
 * Result of a successful retry execution
 */
export interface RetryResult<T> {
  value: T;
  /** Number of attempts made (includes the successful one) */
  attempts: number;
  /** Total delay time in milliseconds accumulated across retries */
  totalDelayMs: number;
}

// ============================================================================
// Backoff Calculation
// ============================================================================

/**
 * Calculate delay for a given attempt with jitter.
 * Base delay: initialDelayMs * (backoffFactor ^ (attempt - 1))
 * Jitter: ±10% random variation
 * Final delay capped at maxDelayMs.
 */
function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const { initialDelayMs, backoffFactor, maxDelayMs } = policy;
  const baseDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
  const cappedDelay = Math.min(baseDelay, maxDelayMs);
  // ±10% jitter
  const jitter = cappedDelay * 0.1 * Math.random();
  const finalDelay = Math.floor(cappedDelay + jitter - jitter / 2);
  return Math.max(0, finalDelay);
}

// ============================================================================
// Execution with Retry
// ============================================================================

/**
 * Execute an async function with retry logic.
 *
 * @param fn - Function to execute (may throw)
 * @param policy - Retry configuration
 * @param canRetry - Optional predicate to decide if an error should be retried (default: true for any error)
 * @returns RetryResult containing the successful value and metadata
 * @throws The last error if all attempts fail or canRetry returns false
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  canRetry?: (error: Error, attempt: number) => boolean
): Promise<RetryResult<T>> {
  let lastError: Error | undefined;
  let attempts = 0;
  let totalDelay = 0;

  while (attempts < policy.maxAttempts) {
    attempts++;
    try {
      const result = await fn();
      return { value: result, attempts, totalDelayMs: totalDelay };
    } catch (error) {
      lastError = error as Error;
      const shouldRetry =
        (canRetry ? canRetry(lastError, attempts) : true) &&
        attempts < policy.maxAttempts;
      if (!shouldRetry) {
        throw lastError;
      }
      const delay = calculateDelay(attempts, policy);
      totalDelay += delay;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // If we exit the loop, all attempts exhausted
  throw lastError;
}

// ============================================================================
// In-Memory Policy Store (CRUD)
// ============================================================================

const policies = new Map<string, RetryPolicy>();

/**
 * Create a new retry policy
 * Generates a unique ID automatically.
 */
export function createPolicy(policy: Omit<RetryPolicy, 'id'>): RetryPolicy {
  const newPolicy: RetryPolicy = { ...policy, id: randomUUID() };
  policies.set(newPolicy.id, newPolicy);
  return newPolicy;
}

/**
 * Retrieve a policy by ID
 */
export function getPolicy(id: string): RetryPolicy | undefined {
  return policies.get(id);
}

/**
 * Update an existing policy (partial update)
 */
export function updatePolicy(
  id: string,
  updates: Partial<Omit<RetryPolicy, 'id'>>
): RetryPolicy | undefined {
  const existing = policies.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...updates } as RetryPolicy;
  policies.set(id, updated);
  return updated;
}

/**
 * Delete a policy
 */
export function deletePolicy(id: string): boolean {
  return policies.delete(id);
}

/**
 * List all policies
 */
export function listPolicies(): RetryPolicy[] {
  return Array.from(policies.values());
}
