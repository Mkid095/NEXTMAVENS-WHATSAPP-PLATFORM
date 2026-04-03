/**
 * Feature Management Service
 * Provides functionality to manage global feature flags and per-organization overrides.
 *
 * Features follow an inheritance model:
 * 1. Check for org-specific override (enabled/disabled)
 * 2. If no override (null), inherit from global flag
 * 3. Use global flag value
 *
 * Architecture:
 * - types.ts: Type definitions
 * - global.flags.ts: Global feature flag CRUD
 * - org.overrides.ts: Organization override CRUD
 * - feature.checker.ts: Feature evaluation logic (isFeatureEnabled, checkFeatureAccess)
 *
 * All files under 150 lines.
 */

// Global flag management
export * from './global.flags';

// Organization overrides
export * from './org.overrides';

// Feature checking/evaluation
export * from './feature.checker';

// Types
export type {
  FeatureFlag,
  OrganizationFeatureFlag,
  FeatureCheckResult,
  FeatureFlagKey,
} from './types';

// ============================================================================
// Singleton / Initialization
// ============================================================================

/**
 * Initialize feature management system.
 * Currently a no-op but exists for consistency and future extensibility.
 */
export async function initializeFeatureFlags(): Promise<void> {
  // No initialization needed yet - prisma client is lazily instantiated
  return Promise.resolve();
}
