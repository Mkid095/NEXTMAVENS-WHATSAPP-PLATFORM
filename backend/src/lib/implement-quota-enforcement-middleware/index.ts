/**
 * Quota Enforcement Middleware
 *
 * Main entry point - re-exports all components and provides singleton access.
 */

// Re-export types
export * from './types';

// Re-export constants
export { PLAN_QUOTAS } from './constants';

// Re-export utilities
export {
  calculatePeriodStart,
  getPlanLimit,
  calculateResetAt
} from './utils';

// Re-export core class
export { QuotaLimiter } from './quota-limiter.class';

// Re-export middleware
export { quotaMiddleware } from './middleware';

// Re-export usage queries service
export { getUsage } from './usage-queries.service';

// Re-export admin queries service
export { getNearLimitOrgs } from './admin-queries.service';

// ============================================================================
// Singleton Instance
// ============================================================================

import { QuotaLimiter } from './quota-limiter.class';

let quotaLimiterInstance: QuotaLimiter | null = null;

/**
 * Get the global quota limiter instance (singleton)
 */
export function getQuotaLimiter(): QuotaLimiter {
  if (!quotaLimiterInstance) {
    quotaLimiterInstance = new QuotaLimiter();
  }
  return quotaLimiterInstance;
}

/**
 * Initialize the global quota limiter with custom options
 */
export function initializeQuotaLimiter(options?: { prisma?: any }): QuotaLimiter {
  if (!quotaLimiterInstance) {
    quotaLimiterInstance = new QuotaLimiter({ ...options, failOpen: true });
  }
  return quotaLimiterInstance;
}
