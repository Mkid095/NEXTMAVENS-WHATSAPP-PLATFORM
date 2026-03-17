/**
 * Retry Logic API Routes
 * Exposes CRUD for retry policies and a test endpoint.
 *
 * Base path: / (mounted directly)
 * Endpoints:
 * - POST   /policies        - Create a new retry policy
 * - GET    /policies        - List all policies
 * - GET    /policies/:id    - Get policy by ID
 * - PUT    /policies/:id    - Update policy
 * - DELETE /policies/:id    - Delete policy
 * - POST   /retry-test      - Execute a test operation using provided policy
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as retryLib from '../../../lib/build-retry-logic-with-progressive-backoff';

// ============================================================================
// Zod Schemas
// ============================================================================

const createPolicySchema = z.object({
  name: z.string().optional(),
  maxAttempts: z.number().int().positive(),
  initialDelayMs: z.number().int().positive(),
  backoffFactor: z.number().positive(),
  maxDelayMs: z.number().int().positive(),
});

const updatePolicySchema = z.object({
  name: z.string().optional(),
  maxAttempts: z.number().int().positive().optional(),
  initialDelayMs: z.number().int().positive().optional(),
  backoffFactor: z.number().positive().optional(),
  maxDelayMs: z.number().int().positive().optional(),
});

type CreatePolicyBody = z.infer<typeof createPolicySchema>;
type UpdatePolicyBody = z.infer<typeof updatePolicySchema>;

const retryTestSchema = z.object({
  policy: createPolicySchema,
  succeedAfter: z.number().int().nonnegative(),
});

type RetryTestBody = z.infer<typeof retryTestSchema>;

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // ------------------------------------------------------------------------
  // CRUD: Retry Policies
  // ------------------------------------------------------------------------

  fastify.post(
    '/policies',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createPolicySchema.parse(request.body);
        const policy = retryLib.createPolicy(body);
        return { policy };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  fastify.get('/policies', async () => {
    return { policies: retryLib.listPolicies() };
  });

  fastify.get('/policies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const policy = retryLib.getPolicy(id);
    if (!policy) {
      reply.code(404);
      return { error: 'Policy not found' };
    }
    return { policy };
  });

  fastify.put(
    '/policies/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = updatePolicySchema.parse(request.body);
        const updated = retryLib.updatePolicy(id, body);
        if (!updated) {
          reply.code(404);
          return { error: 'Policy not found' };
        }
        return { policy: updated };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  fastify.delete('/policies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = retryLib.deletePolicy(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Policy not found' };
    }
    return { deleted: true };
  });

  // ------------------------------------------------------------------------
  // Test endpoint: execute a flaky operation with retry
  // ------------------------------------------------------------------------

  fastify.post(
    '/retry-test',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = retryTestSchema.parse(request.body);
        const { policy, succeedAfter } = body;
        const policyObj = retryLib.createPolicy(policy); // validate and assign ID
        let attempts = 0;

        // Simulate a flaky operation: fails until attempts >= succeedAfter
        const flakyOp = async () => {
          attempts++;
          if (attempts < succeedAfter) {
            throw new Error(`Transient failure (attempt ${attempts})`);
          }
          return 'Operation succeeded';
        };

        try {
          const result = await retryLib.executeWithRetry(flakyOp, policyObj);
          return {
            success: true,
            result: result.value,
            attempts: result.attempts,
            totalDelayMs: result.totalDelayMs,
            policyId: policyObj.id,
          };
        } catch (error: any) {
          reply.code(500);
          return {
            success: false,
            error: error.message,
            attempts,
            policyId: policyObj.id,
          };
        }
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );
}
