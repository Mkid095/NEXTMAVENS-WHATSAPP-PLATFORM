/**
 * Chat Pagination System - Core Pagination Logic
 *
 * Provides keyset-based pagination for chat messages.
 * Uses compound cursor (createdAt + id) for stable, performant queries.
 */

import { prisma } from '../prisma';
import { decodeCursor } from './cursor';
import { getOrderBy, reverseItemsIfNeeded } from './order';
import type { ChatPaginationOptions, ChatPage } from './types';
import { buildCursorWhere, buildStartAfterWhere, buildCursors } from './pagination.helpers';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Paginate chat messages for an organization and instance.
 *
 * Uses keyset pagination with compound cursor (createdAt + id) for O(1) performance
 * regardless of page depth. Supports bidirectional navigation.
 */
export async function paginateChats(
  options: ChatPaginationOptions
): Promise<ChatPage> {
  const {
    orgId,
    instanceId,
    limit = DEFAULT_LIMIT,
    cursor,
    direction = 'next',
    startAfterChatId
  } = options;

  // Validate inputs
  if (!orgId || !instanceId) {
    throw new Error('orgId and instanceId are required');
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_LIMIT}`);
  }

  let whereClause: any = {
    orgId,
    instanceId
  };

  // Add cursor-based WHERE clause if cursor provided
  if (cursor) {
    const decodedCursor = decodeCursor(cursor);
    const cursorWhere = buildCursorWhere(decodedCursor, direction, orgId, instanceId);
    whereClause = { AND: [whereClause, cursorWhere] };
  }

  // If startAfterChatId provided, override cursor logic
  if (startAfterChatId) {
    const referenceChat = await prisma.whatsAppChat.findUnique({
      where: { id: startAfterChatId },
      select: { createdAt: true, id: true }
    });

    if (!referenceChat) {
      throw new Error(`Chat with id ${startAfterChatId} not found`);
    }

    whereClause = {
      orgId,
      instanceId,
      ...(buildStartAfterWhere(startAfterChatId, direction, orgId, instanceId, referenceChat))
    };
  }

  // Fetch page data with compound ordering
  const orderBy = getOrderBy(direction);
  const items = await prisma.whatsAppChat.findMany({
    where: whereClause,
    take: limit + 1, // Fetch one extra to determine hasMore
    orderBy,
    select: {
      id: true,
      chatId: true,
      orgId: true,
      instanceId: true,
      phone: true,
      name: true,
      avatar: true,
      lastMessageAt: true,
      unreadCount: true,
      isGroup: true,
      isArchived: true,
      isPinned: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    }
  });

  // Determine if there's a next/prev page
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  // Reverse if we used 'prev' direction (since we fetched in ascending order)
  const orderedItems = reverseItemsIfNeeded(pageItems, direction);

  // Build cursors
  const { nextCursor, prevCursor } = buildCursors(orderedItems, direction, cursor, startAfterChatId, hasMore);

  return {
    data: orderedItems,
    nextCursor,
    prevCursor,
    hasMore
  };
}
