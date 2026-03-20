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

// Paystack client mock
jest.mock('../../../lib/implement-usage-based-billing-&-overage/paystack-client', () => ({
 generateUsageInvoice: jest.fn(),
}));

// Mock tax integration module
jest.mock('../../../lib/tax-integration', () => ({
 getTaxConfig: jest.fn(),
}));

// Mock the metrics as no-ops
jest.mock('../../../lib/implement-usage-based-billing-&-overage/metrics', () => ({
 usageEventsTotal: { inc: jest.fn() },
 currentUsageGauge: { set: jest.fn() },
 quotaRemainingGauge: { set: jest.fn() },
 overageChargesCentsTotal: { inc: jest.fn() },
 paymentApiCallsTotal: { inc: jest.fn() },
 usageRecordingDuration: { observe: jest.fn() },
}));

import { recordUsage, getCurrentUsage, getUsageAnalytics, generatePeriodInvoice } from '../../../lib/implement-usage-based-billing-&-overage/usage-service';
import type { RecordUsageInput, UsageAnalytics } from '../../../lib/implement-usage-based-billing-&-overage/types';
import { prisma as mockPrisma } from '../../../lib/prisma';
import { generateUsageInvoice as mockGenerateInvoice } from '../../../lib/implement-usage-based-billing-&-overage/paystack-client';
import { getTaxConfig as mockGetTaxConfig } from '../../../lib/tax-integration';

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
 email: 'test@example.com',
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
 // No external call during recordUsage
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

 it('should not generate invoice during usage recording (batching is separate)', async () => {
  const input: RecordUsageInput = {
   orgId: mockOrgId,
   customerId: mockCustomerId,
   meterName: mockMeterName,
   value: 75,
  };

  await recordUsage(input);

  // Paystack invoice generation is separate via generatePeriodInvoice
  expect(mockGenerateInvoice).not.toHaveBeenCalled();
 });

 it('should accumulate usage within same period', async () => {
  // First call
  await recordUsage({ orgId: mockOrgId, customerId: mockCustomerId, meterName: mockMeterName, value: 100 });

  // Mock DB returning existing total
  mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 100n }]);

  // Second call
  await recordUsage({ orgId: mockOrgId, customerId: mockCustomerId, meterName: mockMeterName, value: 50 });

  // Verify $queryRaw was called twice (once per usage record)
  expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
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

  // Verify $queryRaw was called
  expect(mockPrisma.$queryRaw).toHaveBeenCalled();
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

describe('generatePeriodInvoice', () => {
 beforeEach(() => {
  mockPrisma.organization.findUnique.mockResolvedValue({
   id: mockOrgId,
   name: 'Test Org',
   email: 'test@example.com',
   plan: 'STARTER',
  } as any);
  mockPrisma.$queryRaw.mockResolvedValue([{ total: 15000n }]); // 15,000 units (exceeds quota)
  mockGenerateInvoice.mockResolvedValue({
   id: 12345,
   request_code: 'PRQ_test123',
   amount: 50000, // 500 NGN in kobo (5,000 overage * 5 cents = 25000 cents = 250 NGN, but let's use 500)
   invoice_number: 1,
   status: 'pending',
   paid: false,
  } as any);
  mockGetTaxConfig.mockResolvedValue(null); // No tax by default
 });

 it('should generate invoice when usage exceeds quota', async () => {
  const result = await generatePeriodInvoice(mockOrgId, mockMeterName);

  expect(result.success).toBe(true);
  expect(result.paymentRequestId).toBe(12345);
  expect(result.requestCode).toBe('PRQ_test123');
  expect(result.amountKobo).toBe(50000);
  expect(mockGenerateInvoice).toHaveBeenCalledWith(
   mockOrgId,
   mockMeterName,
   expect.any(Date),
   expect.any(Date),
   5, // overageRateCents for STARTER
   10000, // includedUnits
   'Test Org',
   'test@example.com',
   15000,
   undefined, // taxRatePercent
   undefined // taxName
  );
 });

 it('should not generate invoice when usage within quota', async () => {
  // Under quota
  mockPrisma.$queryRaw.mockResolvedValue([{ total: 5000n }]);

  const result = await generatePeriodInvoice(mockOrgId, mockMeterName);

  expect(result.success).toBe(true);
  expect(result.message).toBe('No overage to invoice for this period');
  expect(mockGenerateInvoice).not.toHaveBeenCalled();
 });

 it('should throw when organization not found', async () => {
  mockPrisma.organization.findUnique.mockResolvedValueOnce(null);

  await expect(generatePeriodInvoice(mockOrgId, mockMeterName)).rejects.toThrow('Organization not found');
 });

 it('should apply tax when organization has tax configuration', async () => {
  // Set up tax config
  mockGetTaxConfig.mockResolvedValue({
    orgId: mockOrgId,
    taxRate: 7.5,
    taxName: 'VAT',
  });

  // Override usage to ensure overage
  mockPrisma.$queryRaw.mockResolvedValue([{ total: 15000n }]);

  const result = await generatePeriodInvoice(mockOrgId, mockMeterName);

  expect(result.success).toBe(true);
  // Verify generateUsageInvoice called with tax parameters
  expect(mockGenerateInvoice).toHaveBeenCalledWith(
    mockOrgId,
    mockMeterName,
    expect.any(Date),
    expect.any(Date),
    5, // overageRateCents
    10000,
    'Test Org',
    'test@example.com',
    15000,
    7.5, // taxRatePercent
    'VAT' // taxName
  );
 });
});
