/**
 * Status Metrics Types
 * Types for metrics and analytics
 */

import { MessageStatus } from '@prisma/client';

/**
 * Distribution of messages by current status
 */
export interface StatusDistribution {
  [status: string]: number;
}

/**
 * Status transition count (how many times each transition occurred)
 * Format: "PENDING->SENDING": 123
 */
export interface StatusTransitionMetrics {
  [transition: string]: number;
}

/**
 * Comprehensive status metrics
 */
export interface StatusMetrics {
  totalMessages: number;
  distribution: StatusDistribution;
  transitions: StatusTransitionMetrics;
  byReason: Record<string, number>;
  updatedAt: Date;
}
