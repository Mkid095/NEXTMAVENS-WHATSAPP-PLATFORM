/**
 * Usage-Based Billing & Overage - Main Module
 * Exports core functions for recording, querying, and managing usage-based billing
 * Paystack integration for invoice generation
 *
 * Architecture:
 * - types.ts: Type definitions
 * - usage.recorder.ts: Usage recording and quota checking
 * - usage.invoicer.ts: Invoice generation workflows
 * - usage.queries.ts: Usage analytics queries
 * - paystack.types.ts: Paystack API types
 * - http-client.ts: HTTP client for Paystack API
 * - customer.client.ts: Customer management
 * - payment-request.operations.ts: Payment request CRUD
 * - invoice.operations.ts: Invoice generation operations
 * - quota-calculator.ts: Quota and overage calculations
 * - metrics.ts: Prometheus metrics
 *
 * All files under 150 lines.
 */

// Usage operations
export { recordUsage } from './usage.recorder';
export { generatePeriodInvoice } from './usage.invoicer';
export { getCurrentUsage, getUsageAnalytics, healthCheck } from './usage.queries';

// Types
export type {
  UsageEvent,
  RecordUsageInput,
  RecordUsageResult,
  UsageAnalytics,
  Quota
} from './types';

// Paystack client
export { getOrCreateCustomer } from './customer.client';
export {
  createPaymentRequest,
  finalizePaymentRequest,
  sendPaymentRequest,
  getPaymentRequest,
  listPaymentRequests
} from './payment-request.operations';
export { generateUsageInvoice, finalizeAndSendInvoice } from './invoice.operations';
export type {
  PaystackCustomer,
  PaystackLineItem,
  PaystackPaymentRequest,
  PaystackInvoice
} from './paystack.types';
export { paystackRequest } from './http-client';

// Utilities
export { checkQuota, calculateOverage, formatOverageCharge } from './quota-calculator';
export { usageRegistry, collectMetrics, paymentApiCallsTotal } from './metrics';
