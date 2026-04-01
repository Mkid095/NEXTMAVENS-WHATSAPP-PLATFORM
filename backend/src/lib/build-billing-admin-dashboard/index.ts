/**
 * Billing Admin Dashboard Service
 * Provides aggregated billing data and reporting for administrators.
 *
 * Architecture:
 * - types.ts: Type definitions (interfaces)
 * - overview.service.ts: High-level metrics (revenue, overview)
 * - orgs.service.ts: Organization billing summaries
 * - invoices.service.ts: Invoice details and listing
 * - usage.service.ts: Usage tracking and quota info
 * - metrics.service.ts: Advanced analytics and trends
 *
 * All files under 150 lines.
 */

// Re-export types
export * from './types';

// Re-export services
export * from './overview.service';
export * from './orgs.service';
export * from './invoices.service';
export * from './usage.service';
export * from './metrics.service';
