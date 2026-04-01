/**
 * Parsed Webhook Event
 *
 * Internal representation of a webhook after parsing with orgId attached.
 */

import type { EvolutionWebhookPayload } from './base.types';

/**
 * Parsed event with orgId set by instance lookup
 */
export interface ParsedWebhookEvent extends EvolutionWebhookPayload {
  orgId: string;
}
