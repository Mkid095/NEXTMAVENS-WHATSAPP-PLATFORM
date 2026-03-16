/**
 * Chat Pagination System - Helper Queries
 *
 * Simple query functions for fetching all chats or counting them.
 * Use with caution on large datasets.
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;
try {
  const { prisma: globalPrisma } = require('../prisma.js');
  prisma = globalPrisma;
} catch {
  prisma = new PrismaClient();
}

/**
 * Get all chats for an organization and instance.
 * WARNING: Use with caution on large datasets - returns all records.
 *
 * @param orgId - Organization ID
 * @param instanceId - WhatsApp Instance ID
 * @param orderBy - Optional order by clause (default: createdAt desc)
 * @returns Array of all chats
 */
export async function getAllChats(
  orgId: string,
  instanceId: string,
  orderBy?: any
): Promise<Array<{
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
}>> {
  const result = await prisma.whatsAppChat.findMany({
    where: { orgId, instanceId },
    orderBy: orderBy || [{ createdAt: 'desc' }],
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
  return result;
}

/**
 * Count chats for an organization and instance.
 *
 * @param orgId - Organization ID
 * @param instanceId - WhatsApp Instance ID
 * @returns Total count of chats
 */
export async function countChats(orgId: string, instanceId: string): Promise<number> {
  const count = await prisma.whatsAppChat.count({
    where: { orgId, instanceId }
  });
  return count;
}
