/**
 * Billing Admin Dashboard Types
 * Provides comprehensive billing overview and reporting for administrators
 */

export interface BillingOverview {
  totalRevenueCents: number; // Total amount collected (paid invoices)
  pendingRevenueCents: number; // Total amount in open/draft invoices
  overdueInvoicesCount: number; // Count of invoices past due date with non-paid status
  totalInvoicesCount: number; // Total number of invoices across all orgs
  paidInvoicesCount: number; // Count of paid invoices
  activeOrganizationsCount: number; // Orgs with at least one invoice or usage event
  averageInvoiceAmountCents: number; // Average paid invoice amount
}

export interface OrgBillingSummary {
  orgId: string;
  orgName: string;
  plan: string;
  email: string | null;
  totalInvoicedCents: number; // Sum of all invoice amounts (all statuses)
  totalPaidCents: number; // Sum of paid invoices only
  outstandingBalanceCents: number; // Sum of open/draft invoices (what's owed)
  lastInvoiceDate: Date | null;
  taxRate: number | null; // Organization tax rate
  taxName: string | null;
  taxId: string | null; // Tax registration number (e.g., VAT ID)
  invoiceCount: number; // Total number of invoices
}

export interface InvoiceDetail {
  id: string;
  number: string;
  orgId: string;
  orgName: string;
  stripeInvoiceId: string; // Paystack payment request code (renamed from Stripe)
  amountCents: number;
  currency: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  paidAt: Date | null;
  createdAt: Date;
  items: InvoiceItemDetail[];
  metadata?: {
    taxRate?: number;
    taxName?: string;
    [key: string]: any;
  };
}

export interface InvoiceItemDetail {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  metadata?: Json;
}

export interface UsageSummary {
  orgId: string;
  orgName: string;
  meterName: string;
  periodStart: Date;
  periodEnd: Date;
  totalUsage: number;
  includedUnits: number;
  overageUnits: number;
  overageChargesCents: number;
  quotaPercentage: number; // percentage of quota used
}

export interface InvoiceFilter {
  orgId?: string;
  status?: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BillingMetrics {
  revenueByMonth: Array<{ month: string; revenueCents: number }>;
  topOrgsByRevenue: Array<{ orgId: string; orgName: string; revenueCents: number }>;
  invoiceStatusDistribution: Array<{ status: string; count: number }>;
  averageTimeToPayDays: number | null; // Average days from invoice creation to payment
}

// Alias for JSON to avoid conflicts
type Json = Record<string, any>;
