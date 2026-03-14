/**
 * Phone Number Validation API Routes
 *
 * Provides REST endpoints for validating and normalizing phone numbers.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as phoneLib from '../../../lib/add-advanced-phone-number-validation';

// ============================================================================
// Zod Schemas
// ============================================================================

const phoneValidationSchema = z.object({
  phone: z.string().min(1).describe('Phone number to validate (E.164, national, or WhatsApp JID)'),
  defaultCountry: z.string().length(2).optional().describe('Default 2-letter country code for national numbers'),
});

type PhoneValidationBody = z.infer<typeof phoneValidationSchema>;

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // ------------------------------------------------------------------------
  // Validate Phone Number
  // ------------------------------------------------------------------------

  fastify.post(
    '/validate',
    { schema: { body: phoneValidationSchema } },
    async (request: FastifyRequest<{ Body: PhoneValidationBody }>, reply: FastifyReply) => {
      const { phone, defaultCountry } = request.body;

      const result = phoneLib.validatePhoneNumber(phone, {
        defaultCountry,
        allowWhatsAppJid: true,
      });

      return result;
    }
  );

  // ------------------------------------------------------------------------
  // Normalize Phone Number (returns just the normalized string or error)
  // ------------------------------------------------------------------------

  fastify.post(
    '/normalize',
    { schema: { body: phoneValidationSchema } },
    async (request: FastifyRequest<{ Body: PhoneValidationBody }>, reply: FastifyReply) => {
      const { phone, defaultCountry } = request.body;

      try {
        const normalized = phoneLib.normalizePhoneNumber(phone, {
          defaultCountry,
          allowWhatsAppJid: true,
        });
        return { normalized, valid: true };
      } catch (error: any) {
        reply.code(400);
        return { valid: false, error: error.message };
      }
    }
  );
}
