/**
 * Usage-Based Billing Admin API
 *
 * Admin endpoints for managing usage invoices and billing.
 * Path: /admin/usage/invoices
 * Access: Requires SUPER_ADMIN or ORG_ADMIN (with orgGuard)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generatePeriodInvoice } from '../../../lib/implement-usage-based-billing-&-overage';

const generateInvoiceBodyZod = z.object({
  orgId: z.string().min(1),
  meterName: z.string().min(1).max(100),
});

const generateInvoiceBodySchema = generateInvoiceBodyZod.toJSONSchema();
delete (generateInvoiceBodySchema as any).$schema;

export default async function (fastify: FastifyInstance) {
  fastify.post(
    '/invoices/generate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, meterName } = generateInvoiceBodyZod.parse(request.body);

        // Get the authenticated user from auth middleware
        const user = (request as any).user as {
          id: string;
          role: string;
          orgId?: string;
        } | null;

        if (!user) {
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized',
          });
        }

        // Only SUPER_ADMIN and ORG_ADMIN can generate invoices
        if (user.role !== 'SUPER_ADMIN' && user.role !== 'ORG_ADMIN') {
          return reply.code(403).send({
            success: false,
            error: 'Access denied: admin role required',
          });
        }

        // ORG_ADMIN can only generate for their own org
        if (user.role !== 'SUPER_ADMIN' && orgId !== user.orgId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied: cannot generate invoices for other orgs',
          });
        }

        // Generate invoice for the current period
        const result = await generatePeriodInvoice(orgId, meterName);

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            success: false,
            error: 'Validation error',
            details: error.format(),
          });
        }
        console.error('[UsageAdmin] Error generating invoice:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to generate invoice',
          details: error.message,
        });
      }
    }
  );

  console.log('[UsageAdmin] Registered admin usage billing routes under /admin/usage/invoices');
}
