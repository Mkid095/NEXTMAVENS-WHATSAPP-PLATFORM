/**
 * Stripe Client for Usage-Based Billing
 * Wrapper around Stripe SDK for Meter Events and Analytics
 */

import Stripe from 'stripe';
import { StripeMeterEventPayload, StripeMeterEventResponse, StripeUsageAnalyticsResponse } from './types';
import { stripeApiCallsTotal } from './metrics';

// Initialize Stripe with secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

// Use any to bypass strict type checking for newer API features
const stripe = new Stripe(stripeSecretKey, {
  maxNetworkRetries: 2,
}) as any;

/**
 * Record a usage meter event in Stripe
 */
export async function recordMeterEvent(
  payload: StripeMeterEventPayload
): Promise<StripeMeterEventResponse> {
  const timer = performance.now();
  try {
    const event = await stripe.billingMeterEvents.create({
      event_name: payload.event_name,
      customer: payload.customer,
      value: payload.value,
      timestamp: payload.timestamp,
      ...(payload.idempotency_key && { idempotency_key: payload.idempotency_key }),
    });

    stripeApiCallsTotal.inc({ endpoint: 'billing_meter_events.create', status: 'success' });

    return {
      id: event.id,
      event_name: event.event_name,
      customer: event.customer,
      value: event.value,
      created: event.created,
    };
  } catch (error: any) {
    stripeApiCallsTotal.inc({ endpoint: 'billing_meter_events.create', status: 'error' });
    throw error;
  }
}

/**
 * Batch create multiple meter events
 */
export async function recordMeterEventsBatch(
  events: StripeMeterEventPayload[]
): Promise<StripeMeterEventResponse[]> {
  const results: StripeMeterEventResponse[] = [];

  for (const event of events) {
    const result = await recordMeterEvent(event);
    results.push(result);
  }

  return results;
}

/**
 * Query usage analytics for a meter
 */
export async function getUsageAnalytics(
  meterId: string,
  customerId: string,
  timeRange: { start: Date; end: Date }
): Promise<StripeUsageAnalyticsResponse> {
  try {
    const analytics = await stripe.billingMeterUsageAnalytics.query({
      meter: meterId,
      customer: customerId,
      time_range: {
        start: Math.floor(timeRange.start.getTime() / 1000),
        end: Math.floor(timeRange.end.getTime() / 1000),
      },
    });

    stripeApiCallsTotal.inc({ endpoint: 'billing_meter_usage_analytics.query', status: 'success' });
    return {
      data: analytics.data?.map((item: any) => ({
        timestamp: item.timestamp,
        value: item.value,
      })) || [],
      has_more: analytics.has_more || false,
      url: analytics.url || '',
    };
  } catch (error: any) {
    stripeApiCallsTotal.inc({ endpoint: 'billing_meter_usage_analytics.query', status: 'error' });
    throw error;
  }
}

/**
 * Retrieve a billing meter by ID
 */
export async function getMeter(meterId: string): Promise<StripeMeter> {
  const meter = await stripe.billingMeters.retrieve(meterId);
  return {
    id: meter.id,
    name: meter.name,
    event_name: meter.event_name,
    aggregation: meter.aggregation as 'sum' | 'count',
    value_settings: meter.value_settings as StripeMeter['value_settings'],
  };
}

/**
 * List all billing meters
 */
export async function listMeters(): Promise<StripeMeter[]> {
  const meters = await stripe.billingMeters.list({ limit: 100 });
  return meters.data.map((m: any) => ({
    id: m.id,
    name: m.name,
    event_name: m.event_name,
    aggregation: m.aggregation as 'sum' | 'count',
    value_settings: m.value_settings as StripeMeter['value_settings'],
  }));
}

/**
 * Create a billing meter
 */
export async function createMeter(params: {
  display_name: string;
  event_name: string;
  aggregation: 'sum' | 'count';
  unit_amount?: number;
}): Promise<StripeMeter> {
  const meter = await stripe.billingMeters.create({
    display_name: params.display_name,
    event_name: params.event_name,
    aggregation: { type: params.aggregation },
    ...(params.unit_amount && { value_settings: { unit_amount: params.unit_amount } }),
  });

  return {
    id: meter.id,
    name: meter.name,
    event_name: meter.event_name,
    aggregation: meter.aggregation as 'sum' | 'count',
    value_settings: meter.value_settings as StripeMeter['value_settings'],
  };
}

type StripeMeter = {
  id: string;
  name: string;
  event_name: string;
  aggregation: 'sum' | 'count';
  value_settings?: {
    unit_amount: number;
    unit_amount_decimal?: string;
  };
};
