/**
 * WhatsApp API Metrics
 */

import { Counter, Histogram } from 'prom-client';

/**
 * Total requests made to WhatsApp Cloud API
 */
export const whatsappApiRequestsTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_api_requests_total',
  help: 'Total requests made to WhatsApp Cloud API',
  labelNames: ['endpoint', 'method', 'status_code'],
});

/**
 * WhatsApp API request latency
 */
export const whatsappApiRequestDuration = new Histogram({
  name: 'whatsapp_platform_whatsapp_api_request_duration_seconds',
  help: 'WhatsApp API request latency',
  labelNames: ['endpoint', 'method'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

/**
 * Total errors from WhatsApp API
 */
export const whatsappApiErrorsTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_api_errors_total',
  help: 'Total errors from WhatsApp API',
  labelNames: ['error_code', 'error_type'],
});

/**
 * Total messages sent via WhatsApp
 */
export const whatsappMessagesSentTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_messages_sent_total',
  help: 'Total messages sent via WhatsApp',
  labelNames: ['message_type'], // text, image, document, audio, video, etc.
});

/**
 * Total webhook status callbacks received from WhatsApp
 */
export const whatsappMessageStatusUpdatesTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_message_status_updates_total',
  help: 'Total webhook status callbacks received from WhatsApp',
  labelNames: ['status'], // sent, delivered, read, failed
});
