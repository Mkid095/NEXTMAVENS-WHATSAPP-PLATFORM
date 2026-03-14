/**
 * Immutable Audit Logging System
 *
 * Provides functions to create and query immutable audit logs.
 * Logs are never modified or deleted once written.
 *
 * All audit entries are stored in the `AuditLog` table (immutable by design).
 */

import { prisma } from '../prisma';
import type { AuditLog as AuditLogModel } from '@prisma/client';

/**
 * Audit log entry creation data.
 */
export interface CreateAuditLogDto {
  orgId?: string | null; // NULL for system or SUPER_ADMIN actions
  userId: string; // Who performed the action
  action: string; // e.g., "user.created", "template.deleted"
  resource?: string; // Type of resource affected (optional)
  resourceId?: string; // ID of affected resource (optional)
  changes?: Record<string, { before?: any; after?: any }>; // Before/after values
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Query parameters for fetching audit logs.
 */
export interface QueryAuditLogsDto {
  orgId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

/**
 * Paginated result of audit logs.
 */
export interface PaginatedAuditLogs {
  items: AuditLogModel[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Create a new immutable audit log entry.
 */
export async function createAuditLog(data: CreateAuditLogDto): Promise<AuditLogModel> {
  // Basic validation
  if (!data.userId) {
    throw new Error('userId is required');
  }
  if (!data.action) {
    throw new Error('action is required');
  }

  const entry = await prisma.auditLog.create({
    data: {
      orgId: data.orgId ?? null,
      userId: data.userId,
      action: data.action,
      resource: data.resource ?? null,
      resourceId: data.resourceId ?? null,
      changes: data.changes ? JSON.parse(JSON.stringify(data.changes)) : null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    },
  });

  return entry;
}

/**
 * Query audit logs with optional filters and pagination.
 *
 * Data is ordered by `createdAt DESC` (newest first).
 */
export async function getAuditLogs(query: QueryAuditLogsDto = {}): Promise<PaginatedAuditLogs> {
  const {
    orgId,
    userId,
    action,
    resource,
    resourceId,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = query;

  const where: any = {};

  if (orgId) where.orgId = orgId;
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (resource) where.resource = resource;
  if (resourceId) where.resourceId = resourceId;

  // Date range filters
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const skip = (page - 1) * limit;
  const total = await prisma.auditLog.count({ where });

  const items = await prisma.auditLog.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return {
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
  };
}

/**
 * Get a single audit log entry by ID.
 */
export async function getAuditLogById(id: string): Promise<AuditLogModel | null> {
  return prisma.auditLog.findUnique({
    where: { id },
  });
}
