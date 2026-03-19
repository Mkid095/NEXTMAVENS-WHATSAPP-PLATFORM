/**
 * Usage-Based Billing & Overage - Type Definitions
 * Core types for tracking usage, quotas, and overage calculations
 */

export interface UsageEvent {
  id?: string;
  orgId: string;
  customerId: string;
  meterName: string;
  value: number;
  recordedAt: Date;
  stripeMeterEventId?: string;
  metadata?: Record<string, any>;
}

export interface UsagePeriod {
  orgId: string;
  meterName: string;
  periodStart: Date;
  periodEnd: Date;
  usageValue: number;
}

export interface Quota {
  planId: string;
  meterName: string;
  includedUnits: number;
  overageRateCents: number; // cost per unit over quota
  currency?: string;
}

export interface QuotaCheckResult {
  withinQuota: boolean;
  currentUsage: number;
  quotaLimit: number;
  available: number; // may be negative if over quota
  overageRateCents?: number;
  estimatedOverageCostCents?: number;
}

export interface OverageCharge {
  orgId: string;
  customerId: string;
  meterName: string;
  overageUnits: number;
  rateCents: number;
  totalCents: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageAnalytics {
  orgId: string;
  meterName: string;
  periodStart: Date;
  periodEnd: Date;
  totalUsage: number;
  dailyBreakdown: DailyUsage[];
  projectedUsage?: number;
}

export interface DailyUsage {
  date: Date;
  value: number;
}

export interface RecordUsageInput {
  orgId: string;
  customerId: string;
  meterName: string;
  value: number;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface RecordUsageResult {
  success: boolean;
  eventId?: string;
  currentUsage?: number;
  quotaRemaining?: number;
  overageWarning?: boolean;
  message?: string;
}

export interface StripeMeterEventPayload {
  event_name: string;
  customer: string;
  value: number;
  timestamp: number; // Unix timestamp
  // Optional: identity for idempotency
  idempotency_key?: string;
}

export interface StripeBillingMeter {
  id: string;
  name: string;
  event_name: string;
  aggregation: 'sum' | 'count';
  value_settings?: {
    unit_amount: number;
    unit_amount_decimal?: string;
  };
}

export interface StripeMeterEventResponse {
  id: string;
  event_name: string;
  customer: string;
  value: number;
  created: number;
}

export interface StripeUsageAnalyticsResponse {
  data: Array<{
    timestamp: number;
    value: number;
  }>;
  has_more: boolean;
  url: string;
}
