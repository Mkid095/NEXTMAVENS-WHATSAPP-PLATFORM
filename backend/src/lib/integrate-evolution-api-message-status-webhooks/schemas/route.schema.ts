/**
 * Route Schema
 * Full webhook endpoint validation (body + headers + responses)
 */

import { webhookBodySchema } from './base.schema';

/**
 * Complete route schema for Fastify webhook endpoint
 */
export const routeSchema = {
  body: webhookBodySchema,
  headers: {
    type: 'object',
    properties: {
      'x-webhook-signature': {
        type: 'string',
        description: 'HMAC-SHA256 signature for verification',
      },
    },
    required: ['x-webhook-signature'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        received: { type: 'boolean' },
        processed: { type: 'boolean' },
        event: { type: 'string' },
        messageId: { type: 'string', nullable: true },
      },
    },
    400: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
  },
};
