/**
 * Status History Types
 * Types for tracking status change history and queries
 */

import { MessageStatus } from '@prisma/client';

/**
 * A single status change record
 */
export interface StatusHistoryEntry {
  id: string;
  messageId: string;
  status: MessageStatus;
  changedAt: Date;
  changedBy: string | null;     // user ID or 'system'
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Query parameters for fetching status history
 */
export interface StatusHistoryQuery {
  messageId: string;
  orgId: string;
  limit?: number;
  offset?: string;      // Pagination cursor (ID)
  fromDate?: Date;
  toDate?: Date;
  status?: MessageStatus;
  reason?: string;
}

/**
 * Paginated result for status history
 */
export interface PaginatedStatusHistory {
  entries: StatusHistoryEntry[];
  total: number;
  nextOffset: string | null;
  hasMore: boolean;
}
