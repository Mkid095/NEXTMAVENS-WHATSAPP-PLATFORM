/**
 * Centralized TypeScript Types
 *
 * All type definitions organized by domain.
 * Import from this file for consistency.
 *
 * Domain-specific files:
 * - instance.types.ts   : WhatsApp instances, settings, periods
 * - chat.types.ts       : Chats, messages, WebSocket events
 * - webhook.types.ts    : Webhooks, delivery logs
 * - agent.types.ts      : Agents, queue assignments
 * - group.types.ts      : Groups, participants
 * - template.types.ts   : Message templates, components
 * - analytics.types.ts  : Metrics, performance data
 * - auth.types.ts       : Users, auth credentials
 * - subinstance.types.ts: Reseller, sub-instances
 * - generic.types.ts    : ApiResponse, common generics
 */

// Re-export everything from domain-specific files
export * from './generic.types';
export * from './instance.types';
export * from './chat.types';
export * from './webhook.types';
export * from './agent.types';
export * from './group.types';
export * from './template.types';
export * from './analytics.types';
export * from './auth.types';
export * from './subinstance.types';
