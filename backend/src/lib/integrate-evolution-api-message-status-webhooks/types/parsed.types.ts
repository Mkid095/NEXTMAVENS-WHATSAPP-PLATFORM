/**
 * Parsed Webhook Event
 *
 * Internal representation of a webhook after parsing with orgId attached.
 * Uses a discriminated union based on event type.
 */

import type {
  EvolutionEventType,
  EvolutionEventData,
} from './base.types';

// Base structure common to all parsed events
interface BaseParsedEvent {
  event: EvolutionEventType;
  instanceId: string;
  timestamp?: number;
  data: EvolutionEventData;
  orgId?: string; // set later by processor
}

export interface ParsedMessageUpsertEvent extends BaseParsedEvent {
  event: 'MESSAGES_UPSERT';
  messageId: string;
  chatId: string;
  from: string;
  to: string;
  type: string;
  content?: any;
  status?: string;
}

export interface ParsedMessageUpdateEvent extends BaseParsedEvent {
  event: 'MESSAGES_UPDATE';
  messageId: string;
  status: string;
}

export interface ParsedMessageDeleteEvent extends BaseParsedEvent {
  event: 'MESSAGES_DELETE';
  messageId: string;
}

export interface ParsedConnectionUpdateEvent extends BaseParsedEvent {
  event: 'CONNECTION_UPDATE';
  message?: string;
}

export interface ParsedQRCodeUpdateEvent extends BaseParsedEvent {
  event: 'QRCODE_UPDATED';
  qrCode: string;
  status?: string;
}

export interface ParsedSendMessageEvent extends BaseParsedEvent {
  event: 'SEND_MESSAGE';
  messageId: string;
  status: string;
}

export interface ParsedApplicationStartupEvent extends BaseParsedEvent {
  event: 'APPLICATION_STARTUP';
}

export interface ParsedGenericEvent extends BaseParsedEvent {
  // No additional flattened fields for unhandled event types
}

/**
 * Union of all parsed webhook events
 */
export type ParsedWebhookEvent =
  | ParsedMessageUpsertEvent
  | ParsedMessageUpdateEvent
  | ParsedMessageDeleteEvent
  | ParsedConnectionUpdateEvent
  | ParsedQRCodeUpdateEvent
  | ParsedSendMessageEvent
  | ParsedApplicationStartupEvent
  | ParsedGenericEvent;
