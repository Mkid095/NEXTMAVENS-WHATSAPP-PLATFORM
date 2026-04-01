/**
 * Comprehensive Metrics Dashboard (Grafana)
 * Deprecated: Use infrastructure/metrics instead.
 * This file is now a compatibility wrapper that re-exports from the new modular metrics system.
 *
 * Architecture:
 * - All metric definitions and setup are in ../../infrastructure/metrics
 * - This file provides backward compatibility for existing imports
 *
 * Migration:
 *   Instead of: import { setupMetrics } from './lib/create-comprehensive-metrics-dashboard-(grafana)';
 *   Use:         import { setupMetrics } from './infrastructure/metrics';
 */

// Re-export everything from the new modular metrics system
export * from '../../infrastructure/metrics';
