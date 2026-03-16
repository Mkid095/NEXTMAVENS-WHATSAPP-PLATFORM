/**
 * Chat Pagination System - Types
 *
 * Type definitions for cursor-based pagination of chat messages.
 */

/**
 * Cursor represents a position in the sorted result set.
 * Encodes both timestamp and UUID for stable pagination.
 */
export interface ChatCursor {
  createdAt: string; // ISO timestamp
  id: string;        // Chat UUID
}

/**
 * Pagination direction
 */
export type PaginationDirection = 'next' | 'prev';

/**
 * Pagination request parameters
 */
export interface ChatPaginationOptions {
  /** Org ID (required for RLS context) */
  orgId: string;
  /** Instance ID (required for filtering chats) */
  instanceId: string;
  /** Page size (1-100, default: 50) */
  limit?: number;
  /** Opaque cursor from previous response (Base64 encoded ChatCursor JSON) */
  cursor?: string;
  /** Pagination direction (default: 'next') */
  direction?: PaginationDirection;
  /** Optional: filter by specific chatId to start from */
  startAfterChatId?: string;
}

/**
 * Pagination result
 */
export interface ChatPage {
  /** Array of chat messages for this page */
  data: Array<{
    id: string;
    chatId: string;
    orgId: string;
    instanceId: string;
    phone: string;
    name: string | null;
    avatar: string | null;
    lastMessageAt: Date | null;
    unreadCount: number;
    isGroup: boolean;
    isArchived: boolean;
    isPinned: boolean;
    metadata: any | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  /** Cursor for next page (null if no more data) */
  nextCursor: string | null;
  /** Cursor for previous page (null if at beginning) */
  prevCursor: string | null;
  /** Whether there are more pages in this direction */
  hasMore: boolean;
}
