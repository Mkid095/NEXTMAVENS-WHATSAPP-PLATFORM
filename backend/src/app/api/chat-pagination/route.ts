/**
 * Chat Pagination API Routes
 *
 * Endpoints for cursor-based pagination of chat message history.
 * Protected by auth + orgGuard middleware.
 *
 * Base path: /api/chats
 * Endpoints:
 * - GET / - List chats with pagination
 *
 * @example GET /api/chats?cursor=ABC123&limit=50&direction=next
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  paginateChats,
  getAllChats,
  countChats,
  type ChatPage
} from '../../../lib/chat-pagination';

// ============================================================================
// Zod Schemas
// ============================================================================

const chatListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.preprocess((val) => {
    if (val === undefined || val === '' || val === null) return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  }, z.number().int().positive().max(100).optional()),
  direction: z.enum(['next', 'prev']).default('next')
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/chats
 * List chats with cursor-based pagination
 */
export async function getChatsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Parse and validate query params
    const query = chatListQuerySchema.parse(request.query);

    const orgId = (request as any).currentOrgId;
    if (!orgId) {
      return reply.code(400).send({
        success: false,
        error: 'Organization context required'
      });
    }

    // Get instanceId from header (required for filtering)
    const instanceId = request.headers['x-instance-id'] as string | undefined;
    if (!instanceId) {
      return reply.code(400).send({
        success: false,
        error: 'Instance ID header (x-instance-id) is required'
      });
    }

    // Perform pagination
    const result: ChatPage = await paginateChats({
      orgId,
      instanceId,
      limit: query.limit,
      cursor: query.cursor,
      direction: query.direction
    });

    return {
      success: true,
      data: {
        chats: result.data,
        pagination: {
          nextCursor: result.nextCursor,
          prevCursor: result.prevCursor,
          hasMore: result.hasMore,
          limit: query.limit || 50,
          direction: query.direction
        }
      }
    };
  } catch (error: any) {
    console.error('[ChatPagination] Error listing chats:', error);
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid query parameters',
        details: error.issues
      });
    }
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch chats',
      message: error.message
    });
  }
}

/**
 * GET /api/chats/debug/all (admin only - disable in production)
 * Fetch all chats (for debugging only - not for production use)
 */
export async function getAllChatsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = (request as any).currentOrgId;
    if (!orgId) {
      return reply.code(400).send({
        success: false,
        error: 'Organization context required'
      });
    }

    const instanceId = request.headers['x-instance-id'] as string;
    if (!instanceId) {
      return reply.code(400).send({
        success: false,
        error: 'Instance ID required'
      });
    }

    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return reply.code(403).send({
        success: false,
        error: 'Debug endpoint disabled in production'
      });
    }

    const chats = await getAllChats(orgId, instanceId);
    const total = await countChats(orgId, instanceId);

    return {
      success: true,
      data: chats,
      meta: { total }
    };
  } catch (error: any) {
    console.error('[ChatPagination] Error fetching all chats:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch chats',
      message: error.message
    });
  }
}

// ============================================================================
// Fastify Route Registration
// ============================================================================

export async function registerChatPaginationRoutes(fastify: any) {
  fastify.get(
    '/api/chats',
    { schema: { hide: true } },
    getChatsHandler
  );

  // Debug endpoint - only in non-production
  if (process.env.NODE_ENV !== 'production') {
    fastify.get(
      '/api/chats/debug/all',
      { schema: { hide: true } },
      getAllChatsHandler
    );
  }

  console.log('[ChatPagination] Registered chat pagination routes');
}

export default registerChatPaginationRoutes;
