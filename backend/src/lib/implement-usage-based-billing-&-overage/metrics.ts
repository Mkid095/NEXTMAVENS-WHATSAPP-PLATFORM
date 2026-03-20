/**
 * Prometheus Metrics for Usage-Based Billing
 */

import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Create a custom registry (don't pollute global default)
export const usageRegistry = new Registry();

// Total usage events recorded (by org, meter)
export const usageEventsTotal = new Counter({
  name: 'usage_events_total',
  help: 'Total number of usage events recorded',
  labelNames: ['org_id', 'meter_name'],
  registers: [usageRegistry],
});

// Current period usage gauge (by org, meter)
export const currentUsageGauge = new Gauge({
  name: 'current_usage_value',
  help: 'Current usage value for the active billing period',
  labelNames: ['org_id', 'meter_name'],
  registers: [usageRegistry],
});

// Quota remaining gauge (by org, meter)
export const quotaRemainingGauge = new Gauge({
  name: 'quota_remaining',
  help: 'Remaining quota units for the current period',
  labelNames: ['org_id', 'meter_name'],
  registers: [usageRegistry],
});

// Overage charges incurred (cents, by org)
export const overageChargesCentsTotal = new Counter({
  name: 'overage_charges_cents_total',
  help: 'Total overage charges incurred in cents',
  labelNames: ['org_id', 'meter_name'],
  registers: [usageRegistry],
});

// Payment Provider API call metrics (Paystack/Stripe)
export const paymentApiCallsTotal = new Counter({
  name: 'payment_api_calls_total',
  help: 'Total calls to Payment Provider API',
  labelNames: ['endpoint', 'status'],
  registers: [usageRegistry],
});

// Usage event recording latency
export const usageRecordingDuration = new Histogram({
  name: 'usage_recording_duration_seconds',
  help: 'Duration of usage event recording operation',
  labelNames: ['meter_name'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [usageRegistry],
});

// Quota check latency
export const quotaCheckDuration = new Histogram({
  name: 'quota_check_duration_seconds',
  help: 'Duration of quota check operation',
  labelNames: ['org_id', 'meter_name'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
  registers: [usageRegistry],
});

// Export function to collect all metrics (for /metrics endpoint)
export function collectMetrics(): Registry {
  return usageRegistry;
}

// Reset metrics (useful for testing) - not implemented due to type issues
// Can be added with a type assertion if needed
