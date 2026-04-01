/**
 * Webhook Processor Core
 *
 * Main webhook processing pipeline.
 */

import { verifyWebhookSignature, getSignatureFromRequest } from './signature';
import { parseWebhookPayload } from './parsers';
import { dispatchWebhookHandler } from './dispatcher';
import { executeWithRetry } from '../build-retry-logic-with-progressive-backoff';
import { captureDeadLetter } from '../build-webhook-dead-letter-queue-system';
import { ensureInitialized, getRetryPolicy, getConfig } from './config-manager';
import { getInstanceInfo, setRlsContext } from './processor.helpers';
import type { WebhookProcessingResult, InstanceInfo } from './types';

/**
 * Process an Evolution API webhook end-to-end
 */
export async function processEvolutionWebhook(
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
  jsonBody: any
): Promise<WebhookProcessingResult> {
  ensureInitialized();

  const signature = getSignatureFromRequest(headers);
  const isValid = verifyWebhookSignature(rawBody, signature, getConfig()!.webhookSecret);

  if (!isValid) {
    const error = 'Invalid webhook signature';
    console.error(`[Webhook] ${error} for event: ${jsonBody.event}`);
    throw new Error(error);
  }

  const instanceInfo = await getInstanceInfo(jsonBody.instanceId);
  if (!instanceInfo) {
    throw new Error(`Instance not found: ${jsonBody.instanceId}`);
  }

  await setRlsContext(instanceInfo.orgId);

  try {
    const parsedEvent = parseWebhookPayload(jsonBody);
    parsedEvent.orgId = instanceInfo.orgId;

    return await dispatchWithRetry(parsedEvent, instanceInfo, jsonBody);
  } catch (error: any) {
    console.error(`Failed to process webhook ${jsonBody.event}:`, error);
    throw error;
  }
}

/**
 * Dispatch webhook with retry logic and DLQ capture
 */
async function dispatchWithRetry(
  parsedEvent: any,
  instanceInfo: InstanceInfo,
  rawEvent: any
): Promise<WebhookProcessingResult> {
  const policy = getRetryPolicy();

  try {
    const result = await executeWithRetry(
      async () => {
        const handlerResult = await dispatchWebhookHandler(parsedEvent, instanceInfo.orgId);
        if (!handlerResult.success) {
          const error = new Error(handlerResult.error || 'Webhook handler failed');
          (error as any).code = 'HANDLER_FAILURE';
          (error as any).isPermanent = handlerResult.error?.toLowerCase().includes('validation') ||
                                       handlerResult.error?.toLowerCase().includes('missing required');
          throw error;
        }
        return handlerResult;
      },
      policy,
      (error: Error) => {
        const isPermanent = (error as any).isPermanent === true;
        if (isPermanent) return false;
        const message = error.message.toLowerCase();
        const isRetryable = !message.includes('validation') &&
                            !message.includes('invalid') &&
                            !message.includes('p2002') &&
                            !message.includes('p2025');
        return isRetryable;
      }
    );

    const handlerResult = result.value;
    return {
      success: handlerResult.success,
      event: rawEvent.event,
      instanceId: rawEvent.instanceId,
      orgId: instanceInfo.orgId,
      messageId: handlerResult.result,
      processedAt: new Date(),
      error: handlerResult.error,
    };
  } catch (error: any) {
    console.error(`❌ Webhook ${rawEvent.event} failed:`, error);

    await captureDeadLetter(
      instanceInfo.orgId,
      instanceInfo.id,
      rawEvent.event,
      rawEvent as Record<string, any>,
      error.message,
      policy.maxAttempts,
      new Date()
    );

    console.log(`💀 Captured dead letter for event ${rawEvent.event} (org: ${instanceInfo.orgId})`);
    (error as any).capturedToDlq = true;
    throw error;
  }
}
