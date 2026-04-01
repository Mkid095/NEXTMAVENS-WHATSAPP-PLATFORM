/**
 * WhatsApp Message Throttling - Type Definitions
 */

/**
 * Throttle configuration for a specific org/instance
 */
export interface ThrottleConfig {
  /** Org ID (null = default for all orgs) */
  orgId: string | null;
  /** Instance ID (null = applies to all instances of org) */
  instanceId: string | null;
  /** Max messages allowed per minute */
  messagesPerMinute: number;
  /** Max messages allowed per hour (optional, 0 = no hourly limit) */
  messagesPerHour: number;
}

/**
 * Result of a throttle check
 */
export interface ThrottleResult {
  /** Whether the message is allowed */
  allowed: boolean;
  /** Remaining messages in current minute window */
  remainingMinute: number;
  /** Remaining messages in current hour window */
  remainingHour: number;
  /** When the window resets (UTC) */
  resetAtMinute: Date;
  resetAtHour: Date;
  /** How many messages have been sent in the current minute window */
  usedMinute: number;
  usedHour: number;
}

/**
 * Throttle metrics for monitoring
 */
export interface ThrottleMetrics {
  totalRequests: number;
  allowed: number;
  blocked: number;
  activeThrottles: number;
}
