/**
 * Evolution API Message Status Webhooks Integration
 *
 * Complete system for receiving and processing Evolution API webhooks
 * with signature verification, multi-tenancy support, and idempotency.
 *
 * Features:
 * - HMAC-SHA256 signature verification
 * - Multi-tenant RLS context management
 * - Message status tracking (sent, delivered, read, failed)
 * - Idempotent processing (upsert pattern)
 * - Comprehensive error handling and logging
 *
 * @packageDocumentation
 */

import { prisma } from '../prisma';
import {
  EvolutionWebhookPayload,
  WebhookProcessingResult,
  WebhookProcessorConfig,
  InstanceInfo,
} from './types';
import {
  verifyWebhookSignature,
  getSignatureFromRequest,
} from './signature';
import { parseWebhookPayload } from './parsers';
import { dispatchWebhookHandler } from './handlers';

// Re-export types for consumers
export * from './types';
export { verifyWebhookSignature } from './signature';
export { parseWebhookPayload } from './parsers';
export { dispatchWebhookHandler } from './handlers';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Configuration singleton (set via environment)
 */
let config: WebhookProcessorConfig | null = null;

/**
 * Initialize the webhook processor with configuration
 *
 * Should be called once at application startup.
 *
 * @param webhookConfig - Configuration including secret
 *
 * @example
 * ```typescript
 * import { initializeWebhookProcessor } from './lib/evolution-webhooks';
 *
 * initializeWebhookProcessor({
 *   webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET!
 * });
 * ```
 */
export function initializeWebhookProcessor(
  webhookConfig: WebhookProcessorConfig
): void {
  config = webhookConfig;

  if (!config.webhookSecret) {
    throw new Error('webhookSecret is required for signature verification');
  }

  console.log('✅ Evolution API webhook processor initialized');
}

/**
 * Ensure config is initialized
 */
function ensureInitialized(): void {
  if (!config) {
    throw new Error(
      'Webhook processor not initialized. Call initializeWebhookProcessor() first.'
    );
  }
}

// ============================================================================
// Core Webhook Processing
// ============================================================================

/**
 * Process an Evolution API webhook end-to-end
 *
 * This is the main function to call from your Fastify/Express route handler.
 *
 * @param rawBody - Raw request body as Buffer (for signature verification)
 * @param headers - HTTP headers from request
 * @param jsonBody - Parsed JSON body
 * @returns Processing result with success status
 *
 * @throws {Error} If signature invalid, config missing, or processing fails
 *
 * @example
 * ```typescript
 * fastify.post(
 *   '/api/webhooks/evolution',
 *   { schema: routeSchema, rawBody: true },
 *   async (request, reply) => {
 *     const result = await processEvolutionWebhook(
 *       request.rawBody as Buffer,
 *       request.headers,
 *       request.body as EvolutionWebhookPayload
 *     );
 *
 *     if (result.success) {
 *       return reply.code(200).send({ received: true, processed: true });
 *     } else {
 *       // Log error but still return 200 to prevent retries (idempotent)
 *       return reply.code(200).send({ received: true, processed: false });
 *     }
 *   }
 * );
 * ```
 */
export async function processEvolutionWebhook(
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
  jsonBody: EvolutionWebhookPayload
): Promise<WebhookProcessingResult> {
  ensureInitialized();

  // 1. Verify signature
  const signature = getSignatureFromRequest(headers);
  const isValid = verifyWebhookSignature(rawBody, signature, config!.webhookSecret);

  if (!isValid) {
    const error = 'Invalid webhook signature';
    console.error(`[Webhook] ${error} for event: ${jsonBody.event}`);
    throw new Error(error);
  }

  // 2. Look up instance and get orgId (sets RLS context)
  const instanceInfo = await getInstanceInfo(jsonBody.instanceId);
  if (!instanceInfo) {
    throw new Error(`Instance not found: ${jsonBody.instanceId}`);
  }

  // 3. Set RLS context for this request's database session
  await setRlsContext(instanceInfo.orgId);

  try {
    // 4. Parse webhook into structured event
    const parsedEvent = parseWebhookPayload(jsonBody);
    parsedEvent.orgId = instanceInfo.orgId;

    // 5. Dispatch to appropriate handler
    const result = await dispatchWebhookHandler(parsedEvent, instanceInfo.orgId);

    // Log to console (full audit logging can be added later)
    console.log(`[Webhook] ${instanceInfo.id} ${jsonBody.event} → ${result.success}`);

    return {
      success: result.success,
      event: jsonBody.event,
      instanceId: jsonBody.instanceId,
      orgId: instanceInfo.orgId,
      messageId: result.result,
      processedAt: new Date(),
      error: result.error,
    };
  } catch (error: any) {
    console.error(`Failed to process webhook ${jsonBody.event}:`, error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Look up WhatsApp instance and return its orgId
 *
 * Uses SUPER_ADMIN bypass to access all instances.
 * Throws if instance not found.
 */
async function getInstanceInfo(
  instanceId: string
): Promise<InstanceInfo | null> {
  try {
    // Need SUPER_ADMIN role to bypass RLS and find any instance
    await prisma.$executeRaw`
      SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)
    `;
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', NULL, false)
    `;

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        orgId: true,
        status: true,
        webhookUrl: true,
      },
    });

    return instance ?? null;
  } catch (error) {
    console.error(`Error looking up instance ${instanceId}:`, error);
    return null;
  }
}

/**
 * Set database RLS context to the specified org
 *
 * All subsequent queries will be scoped to this org automatically.
 */
async function setRlsContext(orgId: string): Promise<void> {
  await prisma.$executeRaw`
    SELECT set_config('app.current_org', ${orgId}, false)
  `;
  // Use API_USER role (non-admin) to enforce RLS (no bypass)
  await prisma.$executeRaw`
    SELECT set_config('app.current_user_role', 'API_USER', false)
  `;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Verify the webhook processor is ready to use
 */
export function healthCheck(): boolean {
  return config !== null && config.webhookSecret.length > 0;
}

/**
 * Get the current webhook configuration (for debugging)
 */
export function getConfig(): WebhookProcessorConfig | null {
  return config;
}

// Auto-initialize from environment if not explicitly called
if (process.env.EVOLUTION_WEBHOOK_SECRET && !config) {
  initializeWebhookProcessor({
    webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET,
  });
}
