/**
 * WhatsApp Message Throttling - Configuration Constants
 */

import type { ThrottleConfig } from './types';

export const DEFAULT_THROTTLE: ThrottleConfig = {
  orgId: null,
  instanceId: null,
  messagesPerMinute: 100,  // Default: 100 msg/min per instance
  messagesPerHour: 5000,   // Default: 5K msg/hour per instance
};

// Redis key patterns
export const KEY_PREFIX = 'throttle:whatsapp';
export const KEY_MINUTE = (orgId: string, instanceId: string) => `${KEY_PREFIX}:minute:${orgId}:${instanceId}`;
export const KEY_HOUR = (orgId: string, instanceId: string) => `${KEY_PREFIX}:hour:${orgId}:${instanceId}`;

// Config storage key
export const CONFIG_KEY = 'throttle:configs';
