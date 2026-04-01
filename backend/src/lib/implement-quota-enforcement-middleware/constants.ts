/**
 * Plan Quota Limits (Hardcoded)
 *
 * These are the default limits for each subscription plan.
 * In production, these could be moved to a database table for admin configurability.
 */

import { QuotaMetric } from './types';

export const PLAN_QUOTAS: Record<string, Record<QuotaMetric, number>> = {
  FREE: {
    [QuotaMetric.MESSAGES_SENT]: 1_000,           // 1K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 10,           // 10 numbers (increased for dev)
    [QuotaMetric.API_CALLS]: 10_000,             // 10K API requests/day
    [QuotaMetric.STORAGE_USAGE]: 100_000_000     // 100MB storage
  },
  STARTER: {
    [QuotaMetric.MESSAGES_SENT]: 10_000,          // 10K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 3,            // 3 numbers
    [QuotaMetric.API_CALLS]: 50_000,              // 50K API requests/day
    [QuotaMetric.STORAGE_USAGE]: 1_000_000_000   // 1GB storage
  },
  PRO: {
    [QuotaMetric.MESSAGES_SENT]: 50_000,          // 50K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 10,           // 10 numbers
    [QuotaMetric.API_CALLS]: 200_000,             // 200K API requests/day
    [QuotaMetric.STORAGE_USAGE]: 10_000_000_000  // 10GB storage
  },
  ENTERPRISE: {
    [QuotaMetric.MESSAGES_SENT]: 500_000,         // 500K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 50,           // 50 numbers
    [QuotaMetric.API_CALLS]: 2_000_000,           // 2M API requests/day
    [QuotaMetric.STORAGE_USAGE]: 100_000_000_000 // 100GB storage
  }
};
