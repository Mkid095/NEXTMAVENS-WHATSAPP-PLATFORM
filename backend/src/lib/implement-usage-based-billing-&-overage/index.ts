/**
 * Usage-Based Billing & Overage - Main Module
 * Exports core functions for recording, querying, and managing usage-based billing
 * Paystack integration for invoice generation
 */

export { recordUsage, getCurrentUsage, getUsageAnalytics, generatePeriodInvoice, healthCheck } from './usage-service';
export type { UsageEvent, RecordUsageInput, RecordUsageResult, UsageAnalytics, Quota } from './types';
export { getOrCreateCustomer, createPaymentRequest, finalizePaymentRequest, sendPaymentRequest, getPaymentRequest, listPaymentRequests, generateUsageInvoice } from './paystack-client';
export { checkQuota, calculateOverage, formatOverageCharge } from './quota-calculator';
export { usageRegistry, collectMetrics, paymentApiCallsTotal } from './metrics';
