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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = phoneValidationSchema.parse(request.body);
        const { phone, defaultCountry } = body;
        const result = phoneLib.validatePhoneNumber(phone, {
          defaultCountry,
          allowWhatsAppJid: true,
        });
        return result;
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // Normalize Phone Number (returns just the normalized string or error)
  // ------------------------------------------------------------------------

  fastify.post(
    '/normalize',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = phoneValidationSchema.parse(request.body);
        const { phone, defaultCountry } = body;
        const normalized = phoneLib.normalizePhoneNumber(phone, {
          defaultCountry,
          allowWhatsAppJid: true,
        });
        return { normalized, valid: true };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ valid: false, error: 'Validation error', details: error.format() });
          return;
        }
        reply.code(400);
        return { valid: false, error: error.message };
      }
    }
  );
}
