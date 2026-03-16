/**
 * Audit Logging API Route Registration Tests
 * Tests that the audit logging API routes are registered correctly.
 */

import { FastifyInstance } from 'fastify';
import route from '../app/api/build-immutable-audit-logging-system/route';
import { getAuditLogs, getAuditLogById } from '../lib/build-immutable-audit-logging-system';

// Mock the library to avoid database dependency during module load
jest.mock('../lib/build-immutable-audit-logging-system', () => ({
  getAuditLogs: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, hasMore: false }),
  getAuditLogById: jest.fn().mockResolvedValue(null),
}));

describe('Immutable Audit Logging API Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    // Create a fresh Fastify instance for each test
    fastify = new (require('fastify'))({ logger: false }) as FastifyInstance;
    await fastify.register(route);
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('should register GET / (list audit logs) route', async () => {
    const routes = fastify.listeningAddress && fastify._router.stack;
    const listRouteExists = routes?.some((layer: any) => layer.route?.method === 'GET' && layer.route?.path === '/');
    expect(listRouteExists).toBe(true);
  });

  it('should register GET /:id (get audit log by ID) route', async () => {
    const routes = fastify._router.stack;
    const getByIdRoute = routes?.find((layer: any) => layer.route?.path === '/:id' && layer.route?.method === 'GET');
    expect(getByIdRoute).toBeDefined();
  });

  it('should have list handler as function', async () => {
    const routes = fastify._router.stack;
    const listRoute = routes?.find((layer: any) => layer.route?.path === '/' && layer.route?.method === 'GET');
    expect(typeof listRoute.route.handler).toBe('function');
  });

  it('should have get-by-id handler as function', async () => {
    const routes = fastify._router.stack;
    const getByIdRoute = routes?.find((layer: any) => layer.route?.path === '/:id' && layer.route?.method === 'GET');
    expect(typeof getByIdRoute.route.handler).toBe('function');
  });
});
