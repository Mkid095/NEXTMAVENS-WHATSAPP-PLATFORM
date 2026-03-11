/**
 * Webhook Signature Verification
 *
 * Verifies that incoming webhooks are authentically from Evolution API
 * using HMAC-SHA256 signatures.
 *
 * Security: Always verify signatures in a timing-safe manner to prevent
 * timing attacks. Never skip verification in production.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

/**
 * Verify Evolution API webhook signature
 *
 * Evolution API computes HMAC-SHA256 of the raw request body using the
 * shared webhook secret and sends it in the `x-webhook-signature` header.
 *
 * @param rawBody - The raw request body as Buffer (before JSON parsing)
 * @param signature - The signature header value from Evolution API
 * @param secret - The webhook secret configured in Evolution API
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // Compute expected signature
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  // Compare using timingSafeEqual to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // If lengths differ or buffers invalid, signature is invalid
    return false;
  }
}

/**
 * Verify webhook signature with detailed error information
 *
 * Useful for logging security events
 *
 * @param rawBody - Raw request body as Buffer
 * @param signature - Signature header value
 * @param secret - Expected webhook secret
 * @returns Object with verification result and optional error reason
 */
export function verifyWebhookSignatureDetailed(
  rawBody: Buffer,
  signature: string | undefined | null,
  secret: string
): {
  valid: boolean;
  error?: string;
} {
  if (!signature) {
    return { valid: false, error: 'Missing signature header' };
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  if (signature.length !== expectedSignature.length) {
    return { valid: false, error: 'Signature length mismatch' };
  }

  try {
    const isValid = timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' };
  } catch (error) {
    return {
      valid: false,
      error: `Signature comparison error: ${(error as Error).message}`,
    };
  }
}

/**
 * Extract signature from HTTP headers
 *
 * @param headers - HTTP headers record (case-insensitive lookup)
 * @returns Signature string or null if not present
 */
export function getSignatureFromRequest(
  headers: Record<string, string | undefined>
): string | null {
  // Try the standard header name first (case-insensitive)
  const signature =
    headers[WEBHOOK_SIGNATURE_HEADER] ||
    headers['x-webhook-signature'] ||
    headers['X-Webhook-Signature'] ||
    null;
  return signature ?? null;
}
