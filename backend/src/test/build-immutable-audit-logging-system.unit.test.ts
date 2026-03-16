/**
 * Unit Tests - Immutable Audit Logging System
 */

import { createAuditLog, getAuditLogs, getAuditLogById } from '../lib/build-immutable-audit-logging-system';
import { prisma } from '../lib/prisma';

// Mock prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockedAuditLog = (prisma as any).auditLog;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createAuditLog', () => {
  it('creates an entry with required fields', async () => {
    const mockEntry = { id: 'log-1', userId: 'u1', action: 'a1' };
    mockedAuditLog.create.mockResolvedValue(mockEntry);

    const result = await createAuditLog({ userId: 'u1', action: 'a1' });

    expect(result).toBe(mockEntry);
  });

  it('includes optional fields', async () => {
    const mockEntry = { id: 'log-2', userId: 'u2', action: 'a2', orgId: 'org-1' };
    mockedAuditLog.create.mockResolvedValue(mockEntry);

    await createAuditLog({ userId: 'u2', action: 'a2', orgId: 'org-1' });

    expect(mockedAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org-1' }) })
    );
  });

  it('throws if userId missing', async () => {
    await expect(createAuditLog({ action: 'a' } as any)).rejects.toThrow('userId is required');
  });

  it('throws if action missing', async () => {
    await expect(createAuditLog({ userId: 'u' } as any)).rejects.toThrow('action is required');
  });
});

describe('getAuditLogs', () => {
  it('returns paginated logs with defaults', async () => {
    const logs = [{ id: '1' }, { id: '2' }];
    mockedAuditLog.findMany.mockResolvedValue(logs);
    mockedAuditLog.count.mockResolvedValue(2);

    const result = await getAuditLogs();

    expect(result).toEqual({
      items: logs,
      total: 2,
      page: 1,
      limit: 50,
      hasMore: false,
    });
  });

  it('applies filters', async () => {
    mockedAuditLog.findMany.mockResolvedValue([]);
    mockedAuditLog.count.mockResolvedValue(0);

    await getAuditLogs({
      orgId: 'org-123',
      action: 'login',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      page: 2,
      limit: 25,
    });

    expect(mockedAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: 'org-123',
          action: 'login',
          createdAt: expect.objectContaining({
            gte: new Date('2026-01-01'),
            lte: new Date('2026-01-31'),
          }),
        }),
        skip: 25,
        take: 25,
      })
    );
  });
});

describe('getAuditLogById', () => {
  it('returns log by id', async () => {
    const log = { id: 'log-id', action: 'test' };
    mockedAuditLog.findUnique.mockResolvedValue(log);

    const result = await getAuditLogById('log-id');

    expect(result).toBe(log);
  });

  it('returns null if not found', async () => {
    mockedAuditLog.findUnique.mockResolvedValue(null);
    expect(getAuditLogById('missing')).resolves.toBeNull();
  });
});
