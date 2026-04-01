/**
 * WhatsApp Message Throttling Middleware Wrapper
 *
 * Integrates token-bucket throttle into the global preHandler.
 * Applies only to WhatsApp message send operations.
 */

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { whatsAppMessageThrottle } from '../../lib/add-whatsapp-message-throttling/index.js';

/**
 * Throttle check middleware - use in preHandler
 *
 * Checks if the organization/instance is within its message throttling limits.
 * Only applies to message sending endpoints.
 */
export async function throttleCheck(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    const orgId = (request as any).currentOrgId;
    if (!orgId) {
      return done(); // No org context, skip throttle
    }

    // Determine if this is a message-sending request
    const path = request.routerPath || request.url;
    const isMessageSend = path.includes('/messages') || path.includes('/send') || path.includes('/whatsapp');

    if (!isMessageSend) {
      return done(); // Not a messaging operation, skip throttle
    }

    // Get instance ID: from header x-instance-id or from body (if parsed)
    let instanceId = request.headers['x-instance-id'] as string | undefined;

    // If not in header, try to extract from body (for POST /messages)
    if (!instanceId && request.body && typeof request.body === 'object') {
      instanceId = (request.body as any).instanceId || (request.body as any).whatsappInstanceId;
    }

    if (!instanceId) {
      // Cannot throttle without instance ID; skip (could also reject as bad request)
      console.warn('[Throttle] No instance ID found for message send request');
      return done();
    }

    // Check throttle
    const result = await whatsAppMessageThrottle.check(orgId, instanceId);

    if (!result.allowed) {
      reply.code(429).send({
        error: 'Throttle limit exceeded',
        message: `WhatsApp message sending throttled. Remaining: ${result.remainingMinute}/min, ${result.remainingHour}/hour.`,
        throttle: {
          remainingMinute: result.remainingMinute,
          remainingHour: result.remainingHour,
          resetAtMinute: result.resetAtMinute.toISOString(),
          resetAtHour: result.resetAtHour.toISOString(),
        }
      });
      return done(); // Response sent, stop
    }

    // Add throttle headers for visibility/debugging (optional)
    reply.header('X-Throttle-Minute-Remaining', result.remainingMinute.toString());
    reply.header('X-Throttle-Hour-Remaining', result.remainingHour.toString());

    return done();
  } catch (error: any) {
    console.error('Throttle middleware error:', error);
    // Throttle failures should not block requests (fail open)
    return done();
  }
}
