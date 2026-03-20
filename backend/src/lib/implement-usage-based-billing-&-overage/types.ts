/**
 * Usage-Based Billing & Overage - Type Definitions
 * Core types for tracking usage, quotas, and overage calculations
 * Integrated with Paystack for invoice management
 */

export interface UsageEvent {
  id?: string;
  orgId: string;
  customerId: string;
  meterName: string;
  value: number;
  recordedAt: Date;
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

// Paystack types
export interface PaystackInvoiceItem {
  id: number;
  description: string;
  amount: number; // in kobo
  invoice: number;
  customer: string;
}

export interface PaystackInvoice {
  id: number;
  invoice_number: string;
  customer: {
    email: string;
    id: number;
  };
  status: 'draft' | 'sent' | 'paid' | 'failed' | 'voided';
  due_date: string;
  amount: number; // total in kobo
  created_at: string;
  metadata?: Record<string, any>;
}
