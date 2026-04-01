/**
 * Centralized Query Keys
 * Provides type-safe query key factories for React Query
 *
 * Usage:
 *   const queryKey = queryKeys.chats(instanceId);
 *   queryClient.invalidateQueries(queryKey);
 */

/**
 * Instance-related keys
 */
export const instanceKeys = {
  all: ['instances'] as const,
  detail: (id: string) => [...instanceKeys.all, id] as const,
  apiKeys: (instanceId: string) => ['instances', instanceId, 'api-keys'] as const,
};

/**
 * Chat-related keys
 */
export const chatKeys = {
  all: ['chats'] as const,
  forInstance: (instanceId: string) => [...chatKeys.all, instanceId] as const,
  detail: (chatId: string) => [...chatKeys.all, 'detail', chatId] as const,
};

/**
 * Message-related keys
 */
export const messageKeys = {
  forChat: (instanceId: string, chatId: string) => ['messages', instanceId, chatId] as const,
  detail: (messageId: string) => ['messages', 'detail', messageId] as const,
};

/**
 * Agent-related keys
 */
export const agentKeys = {
  all: ['agents'] as const,
  byInstance: (instanceId: string) => ['agents', instanceId] as const,
  queue: (instanceId: string) => ['queue', instanceId] as const,
  assignment: (chatId: string) => ['assignments', chatId] as const,
};

/**
 * Group-related keys
 */
export const groupKeys = {
  all: ['groups'] as const,
  byInstance: (instanceId: string) => [...groupKeys.all, instanceId] as const,
  detail: (groupId: string) => [...groupKeys.all, groupId] as const,
  participants: (groupId: string) => [...groupKeys.detail(groupId), 'participants'] as const,
};

/**
 * Template-related keys
 */
export const templateKeys = {
  all: ['templates'] as const,
  forInstance: (instanceId: string) => ['templates', instanceId] as const,
  detail: (templateId: string) => [...templateKeys.all, templateId] as const,
};

/**
 * Webhook-related keys
 */
export const webhookKeys = {
  config: (instanceId: string) => ['webhooks', instanceId, 'config'] as const,
  deliveries: (instanceId: string) => ['webhooks', instanceId, 'deliveries'] as const,
};

/**
 * Analytics-related keys
 */
export const analyticsKeys = {
  all: ['analytics'] as const,
  byInstance: (instanceId: string, period: string) => ['analytics', instanceId, period] as const,
  agentPerformance: ['analytics', 'agents'] as const,
};

/**
 * Settings-related keys
 */
export const settingsKeys = {
  instance: (instanceId: string) => ['settings', instanceId] as const,
};

/**
 * Auth-related keys
 */
export const authKeys = {
  user: ['user'] as const,
};

/**
 * Reseller/Sub-instance keys
 */
export const subInstanceKeys = {
  all: ['sub-instances'] as const,
  forParent: (parentInstanceId: string) => [...subInstanceKeys.all, parentInstanceId] as const,
  detail: (subInstanceId: string) => [...subInstanceKeys.all, 'detail', subInstanceId] as const,
};

/**
 * API Key keys
 */
export const apiKeyKeys = {
  all: ['whatsapp-api-keys'] as const,
  forInstance: (instanceId: string) => [...apiKeyKeys.all, instanceId] as const,
};

/**
 * QR Code keys
 */
export const qrKeys = {
  forInstance: (instanceId: string) => ['whatsapp-instance-qr', instanceId] as const,
};

/**
 * Helper to create deep partial query keys for invalidation
 * Useful when you want to invalidate a subtree of queries
 */
export function createInvalidator<T extends readonly any[]>(baseKey: T): T {
  return baseKey;
}
