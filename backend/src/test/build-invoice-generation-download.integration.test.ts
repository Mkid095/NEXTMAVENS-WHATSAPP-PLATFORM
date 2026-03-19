/**
 * Invoice Generation & Download - Integration Tests
 *
 * Tests the admin API endpoints with a mocked Fastify server and Prisma.
 */

/// <reference types="jest" />

// ============================================================================
// Mock data definitions (must be before jest.mock calls)
// ============================================================================

const mockInvoice = {
  id: 'inv-123',
  orgId: 'org-456',
  stripeInvoiceId: 'in_test123',
  number: 'INV-12345',
  amount: 5000,
  currency: 'USD',
  status: 'DRAFT' as const,
  periodStart: new Date('2025-01-01'),
  periodEnd: new Date('2025-01-31'),
  dueDate: new Date('2025-02-15'),
  paidAt: null,
  pdfUrl: null,
  createdAt: new Date(),
  items: [
    {
      id: 'item-1',
      invoiceId: 'inv-123',
      orgId: 'org-456',
      description: 'Test Item',
      quantity: 2,
      unitPriceCents: 2500,
      totalCents: 5000,
    },
  ],
};

let currentInvoice: any;

const mockPrisma = {
  invoice: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  invoiceItem: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockStorage = {
  saveFile: jest.fn().mockResolvedValue('/fake/path/invoice.pdf'),
  getFile: jest.fn().mockResolvedValue(Buffer.from('FAKE_PDF')),
  deleteFile: jest.fn().mockResolvedValue(true),
  fileExists: jest.fn().mockResolvedValue(true),
  getDownloadUrl: jest.fn().mockReturnValue('file:///fake/path/invoice.pdf'),
};

// ============================================================================
// Module mocks (must be before imports of modules that use them)
// ============================================================================

jest.mock('../lib/prisma', () => {
  // Diagnostic: ensure mock is used
  console.log('MOCK PRISMA CALLED, mockPrisma keys:', Object.keys(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock('../lib/build-invoice-generation-&-download/pdf-generator.ts', () => ({
  generateInvoicePDF: jest.fn().mockResolvedValue(Buffer.from('FAKE_PDF')),
}));

jest.mock('../lib/build-invoice-generation-&-download/storage.ts', () => ({
  getDefaultStorage: jest.fn(() => mockStorage),
  FilesystemStorageBackend: jest.fn(),
}));

// ============================================================================
// Imports (after mocks are registered)
// ============================================================================

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerInvoiceRoutes } from '../app/api/build-invoice-generation-&-download/route.js';
import * as storageMock from '../lib/build-invoice-generation-&-download/storage.ts';
import * as pdfMock from '../lib/build-invoice-generation-&-download/pdf-generator.ts';

describe('Invoice API Integration', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify({
      logger: false,
    });

    // Reassign mocks that get reset by resetMocks: true
    storageMock.getDefaultStorage.mockImplementation(() => mockStorage);
    pdfMock.generateInvoicePDF.mockImplementation(() => Promise.resolve(Buffer.from('FAKE_PDF')));

    // Reset storage method mocks (they also get reset)
    mockStorage.saveFile = jest.fn().mockResolvedValue('/fake/path/invoice.pdf');
    mockStorage.getFile = jest.fn().mockResolvedValue(Buffer.from('FAKE_PDF'));
    mockStorage.deleteFile = jest.fn().mockResolvedValue(true);
    mockStorage.fileExists = jest.fn().mockResolvedValue(true);
    mockStorage.getDownloadUrl = jest.fn().mockReturnValue('file:///fake/path/invoice.pdf');

    // Reset mutable invoice state for each test
    currentInvoice = JSON.parse(JSON.stringify(mockInvoice));

    // Reassign mock implementations (resetMocks: true clears them, so we need to reinstantiate)
    mockPrisma.invoice.create = jest.fn(async (params: any) => {
      const fresh = JSON.parse(JSON.stringify(mockInvoice));
      currentInvoice = {
        ...fresh,
        ...params.data,
        id: mockInvoice.id,
        createdAt: new Date(),
        items: [],
      };
      return currentInvoice;
    });

    mockPrisma.invoice.findUnique = jest.fn(async (params: any) => {
      const { where } = params;
      if (where.id === currentInvoice?.id) {
        return { ...currentInvoice, items: [...currentInvoice.items] };
      }
      return null;
    });

    mockPrisma.invoice.findMany = jest.fn(async () => {
      if (currentInvoice) {
        return [{ ...currentInvoice, items: [...currentInvoice.items] }];
      }
      return [];
    });

    mockPrisma.invoice.count = jest.fn(async () => 1);

    mockPrisma.invoice.update = jest.fn(async (params: any) => {
      currentInvoice = {
        ...currentInvoice,
        ...params.data,
      };
      return currentInvoice;
    });

    mockPrisma.invoice.delete = jest.fn(async () => currentInvoice);

    mockPrisma.invoiceItem.create = jest.fn(async (params: any) => {
      if (!currentInvoice) {
        throw new Error('Cannot create invoice item: no invoice exists');
      }
      const item = {
        ...params.data,
        id: 'item-1',
      };
      currentInvoice.items.push(item);
      return { id: item.id };
    });

    mockPrisma.$transaction = jest.fn(async (fn: any) => {
      return await fn(mockPrisma);
    });

    // Mock auth + orgGuard: set request.user and provide x-org-id header
    fastify.addHook('preHandler', async (request, reply) => {
      // For tests, we'll trust x-org-id header and create a fake user
      const orgId = request.headers['x-org-id'] as string;
      if (orgId) {
        (request as any).user = {
          id: 'user-123',
          orgId,
        };
      } else {
        reply.code(400).send({ error: 'Missing x-org-id' });
      }
    });

    // Register invoice routes with prefix
    fastify.register(registerInvoiceRoutes, { prefix: '/admin/invoices' });

    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    jest.clearAllMocks();
  });

  describe('POST /admin/invoices', () => {
    it('should create a new invoice', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/invoices',
        body: {
          orgId: 'org-456',
          customerName: 'Acme Corp',
          customerEmail: 'billing@example.com',
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.000Z',
          dueDate: '2025-02-15T00:00:00.000Z',
          lineItems: [
            {
              description: 'Consulting',
              quantity: 1,
              unitPriceCents: 5000,
              totalCents: 5000,
            },
          ],
        },
        headers: {
          'x-org-id': 'org-456',
        },
      });

      // Check that the transaction mock was called
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('inv-123');
      expect(body.data.status).toBe('DRAFT');
    });
  });

  describe('GET /admin/invoices', () => {
    it('should list invoices', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/invoices?orgId=org-456',
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.invoices).toHaveLength(1);
    });
  });

  describe('GET /admin/invoices/:id', () => {
    it('should get invoice by ID', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/invoices/inv-123',
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.number).toBe('INV-12345');
      expect(body.data.items).toHaveLength(1);
    });

    it('should return 404 for non-existent invoice', async () => {
      mockPrisma.invoice.findUnique = jest.fn().mockResolvedValue(null);
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/invoices/nonexistent',
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /admin/invoices/:id/finalize', () => {
    it('should finalize invoice and generate PDF', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/admin/invoices/inv-123/finalize',
        body: {
          companyName: 'Test Company',
        },
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('OPEN');
      expect(body.data.pdfUrl).toBeDefined();
    });
  });

  describe('GET /admin/invoices/:id/download', () => {
    it('should download invoice PDF', async () => {
      // Ensure invoice is finalized for download
      currentInvoice.pdfUrl = '/fake/path/invoice.pdf';
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/invoices/inv-123/download',
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body).toBe('FAKE_PDF');
    });
  });

  describe('POST /admin/invoices/:id/void', () => {
    it('should void invoice', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/invoices/inv-123/void',
        body: {
          reason: 'Cancelled by customer',
        },
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('VOID');
    });
  });

  describe('DELETE /admin/invoices/:id', () => {
    it('should delete draft invoice', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/admin/invoices/inv-123',
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);
    });

    it('should reject deleting non-draft invoice', async () => {
      mockPrisma.invoice.findUnique = jest.fn().mockResolvedValue({
        ...mockInvoice,
        status: 'OPEN',
      });
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/admin/invoices/inv-123',
        headers: {
          'x-org-id': 'org-456',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Only draft invoices can be deleted');
    });
  });
});
