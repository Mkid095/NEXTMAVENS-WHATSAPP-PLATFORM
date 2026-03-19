/**
 * Unit tests for Usage Service
 */

// Mock modules - must be hoisted before imports
jest.mock('../../../lib/prisma', () => ({
 prisma: {
  organization: { findUnique: jest.fn() },
  subscription: { findFirst: jest.fn() },
  usageEvent: { create: jest.fn() },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
 },
}));

jest.mock('../../../lib/implement-usage-based-billing-&-overage/stripe-client', () => ({
 recordMeterEvent: jest.fn(),
}));

// Mock the metrics as no-ops
jest.mock('../../../lib/implement-usage-based-billing-&-overage/metrics', () => ({
 usageEventsTotal: { inc: jest.fn() },
 currentUsageGauge: { set: jest.fn() },
 quotaRemainingGauge: { set: jest.fn() },
 overageChargesCentsTotal: { inc: jest.fn() },
 usageRecordingDuration: { observe: jest.fn() },
}));

import { recordUsage, getCurrentUsage, getUsageAnalytics } from '../../../lib/implement-usage-based-billing-&-overage/usage-service';
import type { RecordUsageInput, UsageAnalytics } from '../../../lib/implement-usage-based-billing-&-overage/types';
import { prisma as mockPrisma } from '../../../lib/prisma';
import { recordMeterEvent as mockStripeRecordMeterEvent } from '../../../lib/implement-usage-based-billing-&-overage/stripe-client';

// Test data
const mockOrgId = 'org-123';
const mockCustomerId = 'cus_123';
const mockPlanId = 'plan-456';
const mockMeterName = 'api_requests';

const mockQuota = {
 planId: mockPlanId,
 meterName: mockMeterName,
 includedUnits: 10000,
 overageRateCents: 50, // $0.50 per unit
 currency: 'usd',
};

const mockSubscription = {
 id: 'sub_123',
 planId: mockPlanId,
 currentPeriodStart: new Date('2025-03-01T00:00:00Z'),
 currentPeriodEnd: new Date('2025-03-31T23:59:59Z'),
};

const mockOrganization = {
 id: mockOrgId,
 name: 'Test Org',
 plan: 'STARTER',
 subscription: mockSubscription,
};

beforeEach(() => {
 jest.clearAllMocks();

 // Default mocks
 mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
 mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
 mockPrisma.usageEvent.create.mockResolvedValue({
  id: 'event-1',
  orgId: mockOrgId,
  customerId: mockCustomerId,
  meterName: mockMeterName,
  value: 100,
  recordedAt: new Date(),
  metadata: null,
 } as any);
 mockPrisma.$queryRaw.mockResolvedValue([{ total: 0n }]);
 mockStripeRecordMeterEvent.mockResolvedValue({
  id: 'stripe-event-1',
  event_name: mockMeterName,
  customer: mockCustomerId,
  value: 100,
  created: Math.floor(Date.now() / 1000),
 });
});

describe('recordUsage', () => {
 it('should successfully record a usage event', async () => {
  const input: RecordUsageInput = {
   orgId: mockOrgId,
   customerId: mockCustomerId,
   meterName: mockMeterName,
   value: 100,
  };

  const result = await recordUsage(input);

  expect(result.success).toBe(true);
  expect(result.eventId).toBeDefined();
  expect(result.currentUsage).toBe(100);
  expect(result.quotaRemaining).toBe(10000 - 100);
  expect(result.overageWarning).toBe(false);
 });

 it('should record event to database', async () => {
  const input: RecordUsageInput = {
   orgId: mockOrgId,
   customerId: mockCustomerId,
   meterName: mockMeterName,
   value: 50,
  };

  await recordUsage(input);

  expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith({
   data: {
    orgId: mockOrgId,
    customerId: mockCustomerId,
    meterName: mockMeterName,
    value: 50,
    recordedAt: expect.any(Date),
    metadata: undefined,
   },
  });
 });

 it('should send meter event to Stripe', async () => {
  const input: RecordUsageInput = {
   orgId: mockOrgId,
   customerId: mockCustomerId,
   meterName: mockMeterName,
   value: 75,
  };

  await recordUsage(input);

  expect(mockStripeRecordMeterEvent).toHaveBeenCalledWith({
   event_name: mockMeterName,
   customer: mockCustomerId,
   value: 75,
   timestamp: expect.any(Number),
   idempotency_key: 'event-1',
  });
 });

 it('should accumulate usage within same period', async () => {
  // First call
  await recordUsage({ orgId: mockOrgId, customerId: mockCustomerId, meterName: mockMeterName, value: 100 });

  // Mock DB returning existing total
  mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 100n }]);

  // Second call
  await recordUsage({ orgId: mockOrgId, customerId: mockCustomerId, meterName: mockMeterName, value: 50 });

  // Verify $queryRaw was called (it uses positional params for Prisma SQL)
  expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  // Check first argument contains the query
  expect(mockPrisma.$queryRaw).toHaveBeenCalledWith(
   expect.any(String),
   expect.any(String),
   expect.any(String),
   expect.any(Date)
  );
 });

 it('should throw if value is not positive', async () => {
  const input: RecordUsageInput = {
   orgId: mockOrgId,
   customerId: mockCustomerId,
   meterName: mockMeterName,
   value: -10,
  };

  await expect(recordUsage(input)).rejects.toThrow('Usage value must be positive');
 });

 it('should throw if organization not found', async () => {
  mockPrisma.organization.findUnique.mockResolvedValueOnce(null);

  const input: RecordUsageInput = {
   orgId: mockOrgId,
   customerId: mockCustomerId,
   meterName: mockMeterName,
   value: 100,
  };

  await expect(recordUsage(input)).rejects.toThrow('Organization not found');
 });
});

describe('getCurrentUsage', () => {
 beforeEach(() => {
  mockPrisma.$queryRaw.mockResolvedValue([{ total: 1234n }]);
 });

 it('should return current period usage', async () => {
  const result = await getCurrentUsage(mockOrgId, mockMeterName);

  expect(result).toEqual({
   usage: 1234,
   periodStart: expect.any(Date),
   periodEnd: expect.any(Date),
  });
 });

 it('should query usage from database', async () => {
  await getCurrentUsage(mockOrgId, mockMeterName);

  // Verify $queryRaw was called with SQL template and parameters
  expect(mockPrisma.$queryRaw).toHaveBeenCalledWith(
   expect.any(String),
   expect.any(String),
   expect.any(String),
   expect.any(Date)
  );
 });
});

describe('getUsageAnalytics', () => {
 it('should aggregate daily usage', async () => {
  const mockRows = [
   { date: '2025-03-01', total: 100n },
   { date: '2025-03-02', total: 200n },
   { date: '2025-03-03', total: 150n },
  ];
  mockPrisma.$queryRaw.mockResolvedValue(mockRows);

  const result: UsageAnalytics = await getUsageAnalytics(
   mockOrgId,
   mockMeterName,
   new Date('2025-03-01'),
   new Date('2025-03-31')
  );

  expect(result.totalUsage).toBe(450);
  expect(result.dailyBreakdown).toHaveLength(3);
  expect(result.dailyBreakdown[0]).toEqual({
   date: new Date('2025-03-01'),
   value: 100,
  });
 });

 it('should return zero if no usage', async () => {
  mockPrisma.$queryRaw.mockResolvedValue([]);

  const result = await getUsageAnalytics(
   mockOrgId,
   mockMeterName,
   new Date('2025-03-01'),
   new Date('2025-03-31')
  );

  expect(result.totalUsage).toBe(0);
  expect(result.dailyBreakdown).toHaveLength(0);
 });
});
