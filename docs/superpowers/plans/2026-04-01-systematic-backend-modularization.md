# Systematic Backend Modularization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce all TypeScript files in backend/src to ≤150 lines by systematically splitting large files into focused, single-responsibility modules while preserving all existing functionality and APIs through barrel re-exports.

**Architecture:** 
- Follow established patterns from recent modularization: split monolithic files into responsibility-based modules (types, metrics, services, handlers, utils) and re-export via barrel index.ts files
- Route files: extract handlers to `handlers/`, validators to `schemas/` or `validators/`, and optionally business logic to `services/`
- Service/lib files: split into `types.ts`, `*.service.ts`, `*.manager.ts`, `*.client.ts`, `*.utils.ts` based on content
- Infrastructure: split by technical concern (connections, authentication, events, adapter)
- Preserve backward compatibility: all existing imports continue to work via barrel exports

**Tech Stack:** 
- TypeScript/Node.js with Fastify
- Prisma ORM, BullMQ (Redis-based queues)
- Socket.IO with Redis adapter
- Paystack (payments), Evolution API (WhatsApp)

---

## Prerequisites & Safety

- **Branch:** `phase3-step-5-implement-usage-based-billing-overage` (current)
- **Test coverage:** Run existing tests after each major change to catch breakages early
- **Import updates:** Use global search/replace to update all affected imports throughout codebase
- **No behavioral changes:** Only restructure - no logic modifications
- **Frequent commits:** Create atomic commits after each file pair (split + barrel updates)

---

## Analysis Summary

**Total files >150 lines:** 46 files (confirmed)
**Largest file:** 334 lines (`app/api/build-coupon-&-discount-system/route.ts`)
**Codebase size:** 35,235 lines total in backend/src

**Categories:**
1. Route handlers (app/api/**/route.ts) - 19 files (largest category)
2. Service barrel files (lib/**/index.ts) - 8 files
3. Infrastructure files (app.ts, websocket.ts) - 2 files
4. Type definition files (lib/**/types.ts) - 5 files
5. Individual service files (services/*.ts) - 6 files
6. Middleware files (shared/middleware) - 2 files
7. Utility files - 4 files

---

## Modularization Strategy by Category

### Strategy A: Route Files (19 files)

**Pattern:** Large route.ts files → extract to handlers/ + schemas/

**Structure:**
```
route.ts (becomes thin router, ~20-50 lines)
├── handlers/
│   ├── create-coupon.handler.ts
│   ├── apply-coupon.handler.ts
│   └── index.ts (barrel)
├── schemas/ (or validators/)
│   ├── create-coupon.schema.ts
│   ├── apply-coupon.schema.ts
│   └── index.ts (barrel)
└── services/ (optional, if business logic is heavy)
    └── coupon.service.ts
```

**Route.ts template:**
```typescript
import { FastifyInstance } from 'fastify';
import * as handlers from './handlers';
import { createCouponSchema, applyCouponSchema } from './schemas';

export async function registerCouponRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/coupons', { schema: { body: createCouponSchema } }, handlers.createCouponHandler);
  fastify.post('/coupons/apply', { schema: { body: applyCouponSchema } }, handlers.applyCouponHandler);
  // ... other routes
}
```

**Handler template:**
```typescript
import { FastifyInstance, FastifyReply } from 'fastify';
import { createCoupon as createCouponService } from '../services/coupon.service';

export async function createCouponHandler(request: FastifyInstance, reply: FastifyReply) {
  // Extract typed data from request (already validated by schema)
  const { code, discountType, discountValue, ... } = request.body as CreateCouponInput;
  const orgId = (request as any).user?.orgId;
  
  const result = await createCouponService({ 
    code, 
    discountType, 
    discountValue, 
    orgId 
  });
  
  return reply.code(201).send(result);
}
```

**Files to update:** Every file that imports from these route files' locations (update imports to point to new handler/schema locations or keep barrel exports)

---

### Strategy B: Service Barrel Files (lib/**/index.ts)

**Pattern:** Large index.ts → split into focused modules, rebuild barrel

**Structure example (implement-message-deduplication-system):**
```
index.ts (barrel re-export, ~30 lines)
├── types.ts (enums, interfaces, configs)
├── deduplication.service.ts (core logic)
├── metrics.service.ts (Prometheus metrics)
├── cache.service.ts (Redis caching)
└── utils.ts (helper functions)
```

**Barrel template:**
```typescript
export * from './types';
export * from './deduplication.service';
export * from './metrics.service';
export * from './cache.service';
export * from './utils';
```

**Files to update:** All imports of `from 'lib/xxx'` continue to work (barrel preserves API). Only internal imports within the module need updating.

---

### Strategy C: Type Definition Files (types.ts >150 lines)

**Pattern:** Split into subdirectory by type category

**Structure:**
```
types/
├── enums.ts (MessageStatus, ErrorCategory, etc.)
├── dto.types.ts (Data Transfer Objects)
├── request.types.ts (API request bodies)
├── response.types.ts (API responses)
├── config.types.ts (Configuration interfaces)
└── index.ts (barrel re-export)
```

**Barrel template:**
```typescript
export * from './enums';
export * from './dto.types';
export * from './request.types';
export * from './response.types';
export * from './config.types';
```

---

### Strategy D: Infrastructure Files (app.ts, websocket.ts)

**app.ts (230 lines) → split by initialization phase:**
```
app/
├── config/
│   ├── index.ts (loads env, validates config)
│   └── cors.config.ts
├── middleware/
│   ├── index.ts (registers all middleware)
│   ├── auth.middleware.ts
│   ├── org-guard.middleware.ts
│   └── error-handler.middleware.ts
├── routes/
│   ├── index.ts (registers all route plugins)
│   ├── auth.routes.ts
│   ├── whatsapp.routes.ts
│   └── admin.routes.ts
├── services/
│   ├── index.ts
│   ├── websocket.service.ts
│   └── metrics.service.ts
└── app.factory.ts (main buildServer function, ~50 lines)
```

**websocket.ts (283 lines) →:**
```
websocket/
├── adapter.ts (Redis adapter setup)
├── authentication.ts (JWT auth logic)
├── connections.ts (connection/disconnection handlers)
├── rooms.ts (room management)
├── events/
│   ├── index.ts (event handlers barrel)
│   ├── message.send.ts
│   ├── status.update.ts
│   └── typing.indicator.ts
└── websocket.service.ts (SocketService class, ~150 lines)
```

---

### Strategy E: Service Files (services/*.ts >150 lines)

**Split by responsibility within the service domain:**

For `message-status-tracking/services/status-update.service.ts (189 lines)`:
```
status-update/
├── status-update.service.ts (core update logic, ~80 lines)
├── validation.service.ts (status transition validation)
├── metrics.service.ts (increment counters, histograms)
├── hooks.service.ts (webhooks, notifications)
└── index.ts (barrel)
```

---

## Task Execution Order

**Dependency order (execute in this sequence to minimize rework):**

### Phase 1: Infrastructure Foundation (Weeks 1-2)
- Split `app.ts` → enables cleaner route module imports
- Split `websocket.ts` → enables cleaner socket integration
- Shared middleware already have patterns to follow

### Phase 2: Core Library Services (Weeks 2-3)
- Split large `lib/**/index.ts` barrel files (they're dependencies for routes)
- Split large `infrastructure/*-client/client.ts` files
- These provide APIs that route files depend on

### Phase 3: Type Definitions (Week 3)
- Split large `types.ts` files
- Types are imported everywhere - split before routes touch them

### Phase 4: Route Files (Weeks 4-6)
- Split 19 route files from largest to smallest
- Each route file becomes a thin router + handlers/schemas
- Test each route module independently

### Phase 5: Individual Service Files (Week 6)
- Split remaining large service files
- Final polish: ensure all imports updated

---

## Detailed Task Breakdown

Each task below follows TDD-inspired structure (even if not strictly test-first):
1. Create new files with actual code
2. Update imports/barrel files
3. Update any dependent code
4. Verify with TypeScript compile
5. Commit

---

## Tasks

### Task 1: Split app.ts (230 lines) → app.factory.ts + modules

**Files to create:**
- `backend/src/app/app.factory.ts` (buildServer function)
- `backend/src/app/config/index.ts`
- `backend/src/app/config/cors.config.ts`
- `backend/src/app/middleware/index.ts`
- `backend/src/app/middleware/error-handler.middleware.ts`
- `backend/src/app/routes/index.ts`
- `backend/src/app/routes/auth.routes.ts`
- `backend/src/app/routes/admin.routes.ts`
- `backend/src/app/routes/whatsapp.routes.ts`
- `backend/src/app/services/index.ts`
- `backend/src/app/services/websocket.service.ts`
- `backend/src/app/services/metrics.service.ts` (if needed)

**Files to modify:**
- `backend/src/app.ts` → replace with simple factory call
- Update main entry point if it imports from app.ts directly

**Steps:**

- [ ] **Step 1.1: Extract configuration module**

Create `backend/src/app/config/index.ts`:
```typescript
import { config } from '../shared/config.js';

export { config };
```

Create `backend/src/app/config/cors.config.ts`:
```typescript
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://whatsapp.nextmavens.cloud';

export function getCorsOptions() {
  return {
    origin: CORS_ORIGIN,
    credentials: true,
  };
}
```

- [ ] **Step 1.2: Extract error handler middleware**

Create `backend/src/app/middleware/error-handler.middleware.ts`:
```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../shared/config.js';
import logger from '../shared/logger.js';

export function errorHandlerMiddleware(app: FastifyInstance) {
  app.setErrorHandler((error: any, request: FastifyRequest, reply: FastifyReply) => {
    logger.error('[ErrorHandler]', {
      error: error.message,
      stack: config.NODE_ENV === 'development' ? error.stack : undefined,
      url: request.url,
      method: request.method,
    });
    
    const statusCode = error.statusCode || 500;
    const message = config.NODE_ENV === 'development' ? error.message : 'Internal server error';
    
    reply.status(statusCode).send({
      success: false,
      error: 'Server error',
      message,
      ...(config.NODE_ENV === 'development' && { stack: error.stack }),
    });
  });
}
```

- [ ] **Step 1.3: Extract route registration modules**

Create `backend/src/app/routes/auth.routes.ts`:
```typescript
import { FastifyInstance } from 'fastify';
import authRoutes from '../../../app/api/auth/route.js';

export function registerAuthRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/api/v1' });
}
```

Create `backend/src/app/routes/admin.routes.ts`:
```typescript
import { FastifyInstance } from 'fastify';
import adminFeaturesRoutes from '../../../app/api/admin/features/route.js';
import workflowRoutes from '../../../app/api/workflow-orchestration/route.js';
import dlqRoutes from '../../../app/api/message-retry-and-dlq/route.js';
import billingDashboardRoutes from '../../../app/api/build-billing-admin-dashboard/route.js';
import quotaRoutes from '../../../app/api/implement-quota-enforcement-middleware/route.js';

export function registerAdminRoutes(app: FastifyInstance) {
  app.register(adminFeaturesRoutes, { prefix: '/api/v1' });
  app.register(workflowRoutes, { prefix: '/api/v1' });
  app.register(dlqRoutes, { prefix: '/api/v1' });
  app.register(billingDashboardRoutes, { prefix: '/api/v1' });
  app.register(quotaRoutes, { prefix: '/api/v1' });
}
```

Create `backend/src/app/routes/whatsapp.routes.ts`:
```typescript
import { FastifyInstance } from 'fastify';
import instanceRoutes from '../../../app/api/whatsapp-instances/index.js';
import messageRoutes from '../../../app/api/messages/index.js';
import templateRoutes from '../../../app/api/whatsapp-templates/route.js';
import groupRoutes from '../../../app/api/whatsapp-groups/route.js';
import agentRoutes from '../../../app/api/whatsapp-agents/route.js';
import analyticsRoutes from '../../../app/api/whatsapp-analytics/route.js';
import assignmentsRoutes from '../../../app/api/whatsapp-assignments/route.js';

export function registerWhatsappRoutes(app: FastifyInstance) {
  app.register(instanceRoutes, { prefix: '/api/v1' });
  app.register(messageRoutes, { prefix: '/api/v1' });
  app.register(templateRoutes, { prefix: '/api/v1' });
  app.register(groupRoutes, { prefix: '/api/v1' });
  app.register(agentRoutes, { prefix: '/api/v1' });
  app.register(analyticsRoutes, { prefix: '/api/v1' });
  app.register(assignmentsRoutes, { prefix: '/api/v1' });
}
```

Create `backend/src/app/routes/index.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.routes.js';
import { registerAdminRoutes } from './admin.routes.js';
import { registerWhatsappRoutes } from './whatsapp.routes.js';
import { registerBillingRoutes } from './billing.routes.js';

export function registerAllRoutes(app: FastifyInstance) {
  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerWhatsappRoutes(app);
  registerBillingRoutes(app);
}
```

- [ ] **Step 1.4: Extract service initialization**

Create `backend/src/app/services/websocket.service.ts`:
```typescript
import { createServer as createHttpServer } from 'http';
import { getSocketService } from '../../infrastructure/websocket.js';

export async function initializeWebSocket(app: ReturnType<import('fastify').FastifyInstance>) {
  const server = createHttpServer(app.server);
  const socketService = getSocketService();
  
  if (socketService) {
    await socketService.initialize(server);
    logger.info('[App] WebSocket service initialized');
  }
  
  return server;
}
```

Create `backend/src/app/services/metrics.service.ts`:
```typescript
export async function initializeMetrics(app: import('fastify').FastifyInstance) {
  const { setupMetrics } = await import('../../lib/create-comprehensive-metrics-dashboard-(grafana)/index.js');
  await setupMetrics(app);
  logger.info('[App] Metrics service initialized');
}
```

- [ ] **Step 1.5: Create new app.factory.ts**

Create `backend/src/app/app.factory.ts`:
```typescript
import Fastify from 'fastify';
import { config } from './shared/config.js';
import logger from './shared/logger.js';
import { getPrisma } from './shared/database.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

// Infrastructure imports
import { initializeRateLimiter } from './lib/rate-limiting-with-redis/index.js';
import { initializeQuotaLimiter } from './lib/implement-quota-enforcement-middleware/index.js';
import { initializeIdempotency, registerOnSendHook } from './lib/implement-idempotency-key-system/index.js';
import { initializeRetryDlqSystem } from './lib/message-retry-and-dlq-system/index.js';
import { initializeFeatureFlags } from './lib/feature-management/index.js';
import { initializeEvolutionClient } from './lib/evolution-api-client/instance.js';

// Middleware
import { authMiddleware } from './shared/middleware/auth.js';
import { orgGuard } from './shared/middleware/orgGuard.js';
import { rateLimitCheck } from './shared/middleware/rateLimit.js';
import { quotaCheck } from './shared/middleware/quota.js';
import { throttleCheck } from './shared/middleware/throttle.js';

// Our extracted modules
import { registerAllRoutes } from './routes/index.js';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware.js';
import { initializeWebSocket } from './services/websocket.service.js';

export async function buildServer(): Promise<Fastify.FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    disableRequestLogging: false,
  });

  logger.info('[SERVER] Building Fastify app...', { env: config.NODE_ENV });

  // ============================================================================
  // PLUGINS & MIDDLEWARE
  // ============================================================================

  app.register(cors, getCorsOptions());
  app.register(helmet);
  app.register(rawBody, { encoding: 'utf-8' });

  // Middleware
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', orgGuard);
  app.addHook('preHandler', rateLimitCheck);
  app.addHook('preHandler', quotaCheck);
  app.addHook('preHandler', throttleCheck);
  app.setErrorHandler(errorHandlerMiddleware);

  // ============================================================================
  // SYSTEM INITIALIZATION
  // ============================================================================

  logger.info('[SERVER] Initializing rate limiter...');
  await initializeRateLimiter();
  logger.info('[SERVER] Rate limiter ready');

  logger.info('[SERVER] Initializing quota limiter...');
  initializeQuotaLimiter({ prisma: getPrisma() });
  logger.info('[SERVER] Quota limiter ready');

  logger.info('[SERVER] Initializing idempotency system...');
  await initializeIdempotency();
  logger.info('[SERVER] Idempotency ready');

  logger.info('[SERVER] Initializing retry DLQ system...');
  await initializeRetryDlqSystem();
  logger.info('[SERVER] Retry DLQ ready');

  logger.info('[SERVER] Initializing feature flags...');
  initializeFeatureFlags();
  logger.info('[SERVER] Feature flags ready');

  logger.info('[SERVER] Initializing Evolution API client...');
  await initializeEvolutionClient();
  logger.info('[SERVER] Evolution API client ready');

  // ============================================================================
  // ROUTES
  // ============================================================================

  registerAllRoutes(app);

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // ============================================================================
  // ON-SEND HOOKS
  // ============================================================================

  app.addHook('onSend', registerOnSendHook);

  logger.info('[SERVER] Fastify app built successfully');

  return app;
}
```

- [ ] **Step 1.6: Replace app.ts with simplified version**

Modify `backend/src/app.ts`:
```typescript
import { buildServer } from './app/app.factory.js';

const start = async () => {
  try {
    const app = await buildServer();
    
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || '0.0.0.0';
    
    app.listen({ port: PORT, host: HOST }, (err, address) => {
      if (err) {
        console.error('[SERVER] Failed to start:', err);
        process.exit(1);
      }
      console.log(`[SERVER] Listening on ${address}`);
    });
  } catch (error) {
    console.error('[SERVER] Startup failed:', error);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 1.7: Update all imports throughout codebase**

Search for imports from `'../../app'` or `'../../../app'` and verify they still resolve:
- If code imported `{ buildServer } from '../app'`, it should still work (app.ts re-exports from app.factory)
- Update internal imports within the new app/ modules to use relative paths

- [ ] **Step 1.8: Type check and test**

```bash
cd backend && npx tsc --noEmit
```

Verify no type errors. If errors, fix import paths.

- [ ] **Step 1.9: Commit**

```bash
git add backend/src/app/
git commit -m "feat: modularize app.ts into app.factory + config/middleware/routes/services modules"
```

---

### Task 2: Split websocket.ts (283 lines) → websocket.service + modules

**Files to create:**
- `backend/src/infrastructure/websocket/websocket.service.ts` (SocketService class, ~150 lines)
- `backend/src/infrastructure/websocket/adapter.ts` (Redis adapter setup)
- `backend/src/infrastructure/websocket/authentication.ts` (JWT auth)
- `backend/src/infrastructure/websocket/connections.ts` (connection handling)
- `backend/src/infrastructure/websocket/rooms.ts` (room management)
- `backend/src/infrastructure/websocket/events/index.ts` (event handlers)
- `backend/src/infrastructure/websocket/websocket.factory.ts` (factory function)
- `backend/src/infrastructure/websocket/index.ts` (barrel)

**Files to modify:**
- `backend/src/infrastructure/websocket.ts` → thin wrapper that calls factory
- Update any code calling `getSocketService()`

**Steps:**

- [ ] **Step 2.1: Extract Redis adapter setup**

Create `backend/src/infrastructure/websocket/adapter.ts`:
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { RedisClientType, createClient } from 'redis';
import logger from '../../shared/logger.js';

export async function createRedisAdapter() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => logger.error('[RedisPub] Error:', err));
  subClient.on('error', (err) => logger.error('[RedisSub] Error:', err));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  logger.info('[SocketIO] Redis clients connected');

  return { adapter: createAdapter(pubClient, subClient), pubClient, subClient };
}
```

- [ ] **Step 2.2: Extract authentication logic**

Create `backend/src/infrastructure/websocket/authentication.ts`:
```typescript
import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/database.js';
import logger from '../../shared/logger.js';

export async function authenticateSocket(token: string): Promise<{
  userId: string;
  orgId: string;
  role: string;
} | null> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const { userId, orgId, role } = decoded;
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    
    if (!user || !user.isActive) {
      logger.warn('[SocketAuth] User not found or inactive:', userId);
      return null;
    }
    
    return { userId, orgId, role };
  } catch (error: any) {
    logger.warn('[SocketAuth] Invalid token:', error.message);
    return null;
  }
}
```

- [ ] **Step 2.3: Extract connection handlers**

Create `backend/src/infrastructure/websocket/connections.ts`:
```typescript
import { Socket } from 'socket.io';
import { prisma } from '../../shared/database.js';
import logger from '../../shared/logger.js';
import { getRedisAdapter } from './adapter.js';

export function setupConnectionHandlers(io: any) {
  io.on('connection', async (socket: Socket) => {
    logger.info('[SocketIO] Client connected:', socket.id);
    
    // Authentication will be handled by middleware
    socket.on('disconnect', async (reason) => {
      logger.info('[SocketIO] Client disconnected:', socket.id, reason);
      
      // Remove from all rooms
      const rooms = [...socket.rooms];
      for (const room of rooms) {
        if (room !== socket.id) {
          socket.leave(room);
        }
      }
    });
    
    // Error handling
    socket.on('error', (error) => {
      logger.error('[SocketIO] Socket error:', error);
    });
  });
}
```

- [ ] **Step 2.4: Extract room management**

Create `backend/src/infrastructure/websocket/rooms.ts`:
```typescript
import { Socket } from 'socket.io';
import logger from '../../shared/logger.js';

export function joinOrgRoom(socket: Socket, orgId: string) {
  const room = `org:${orgId}`;
  socket.join(room);
  logger.debug('[SocketIO] Socket joined org room:', socket.id, room);
}

export function leaveOrgRoom(socket: Socket, orgId: string) {
  const room = `org:${orgId}`;
  socket.leave(room);
  logger.debug('[SocketIO] Socket left org room:', socket.id, room);
}

export function joinInstanceRoom(socket: Socket, instanceId: string) {
  const room = `instance:${instanceId}`;
  socket.join(room);
  logger.debug('[SocketIO] Socket joined instance room:', socket.id, room);
}

export function leaveInstanceRoom(socket: Socket, instanceId: string) {
  const room = `instance:${instanceId}`;
  socket.leave(room);
  logger.debug('[SocketIO] Socket left instance room:', socket.id, room);
}

export function broadcastToOrg(io: any, orgId: string, event: string, data: any) {
  io.to(`org:${orgId}`).emit(event, data);
}

export function broadcastToInstance(io: any, instanceId: string, event: string, data: any) {
  io.to(`instance:${instanceId}`).emit(event, data);
}
```

- [ ] **Step 2.5: Extract events (if needed, or keep in service)**

If websocket.ts has specific event handlers, move them:

Create `backend/src/infrastructure/websocket/events/index.ts`:
```typescript
export * from './message-send.event.js';
export * from './status-update.event.js';
```

- [ ] **Step 2.6: Create new SocketService class**

Create `backend/src/infrastructure/websocket/websocket.service.ts`:
```typescript
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createRedisAdapter } from './adapter.js';
import { setupConnectionHandlers } from './connections.js';
import { joinOrgRoom, joinInstanceRoom } from './rooms.js';
import logger from '../../shared/logger.js';

let socketServiceInstance: SocketService | null = null;

export class SocketService {
  private io: SocketIOServer | null = null;
  private pubClient: any = null;
  private subClient: any = null;

  async initialize(server: ReturnType<typeof createHttpServer>): Promise<void> {
    try {
      const { adapter, pubClient, subClient } = await createRedisAdapter();
      this.pubClient = pubClient;
      this.subClient = subClient;

      this.io = new SocketIOServer(server, {
        adapter,
        cors: {
          origin: process.env.CORS_ORIGIN || 'https://whatsapp.nextmavens.cloud',
          credentials: true,
        },
        maxHttpBufferSize: 1e6,
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      setupConnectionHandlers(this.io);

      logger.info('[SocketService] Socket.IO server initialized with Redis adapter');
    } catch (error) {
      logger.error('[SocketService] Failed to initialize:', error);
      throw error;
    }
  }

  getIO(): SocketIOServer | null {
    return this.io;
  }

  // Helper methods for broadcasting
  broadcastToOrg(orgId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`org:${orgId}`).emit(event, data);
    }
  }

  broadcastToInstance(instanceId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`instance:${instanceId}`).emit(event, data);
    }
  }

  async shutdown(): Promise<void> {
    if (this.io) {
      await this.io.close();
      logger.info('[SocketService] Socket.IO server closed');
    }
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }
  }
}

export function getSocketService(): SocketService | null {
  return socketServiceInstance;
}

export async function initializeSocketService(server: ReturnType<typeof createHttpServer>) {
  socketServiceInstance = new SocketService();
  await socketServiceInstance.initialize(server);
  return socketServiceInstance;
}
```

- [ ] **Step 2.7: Create thin websocket.ts wrapper**

Modify `backend/src/infrastructure/websocket.ts`:
```typescript
import { createServer as createHttpServer } from 'http';
import { getSocketService, initializeSocketService } from './websocket/websocket.service.js';

// Maintain backward compatibility - old code expects these functions
export { getSocketService, initializeSocketService };
```

- [ ] **Step 2.8: Create barrel index.ts**

Create `backend/src/infrastructure/websocket/index.ts`:
```typescript
export * from './websocket.service.js';
export * from './adapter.js';
export * from './authentication.js';
export * from './connections.js';
export * from './rooms.js';
```

- [ ] **Step 2.9: Update imports**

Search for code importing from `'../../infrastructure/websocket'` and ensure the barrel provides all needed exports. The new barrel re-exports everything so most imports should continue working.

- [ ] **Step 2.10: Type check and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/infrastructure/websocket/
git commit -m "feat: modularize websocket.ts into service + adapter/authentication/connections/rooms modules"
```

---

### Task 3: Split lib/message-status-tracking/types.ts (230 lines)

**Strategy:** Extract enums and sub-type groups into subdirectory

**Files to create:**
- `backend/src/lib/message-status-tracking/types/enums.ts`
- `backend/src/lib/message-status-tracking/types/dto.types.ts`
- `backend/src/lib/message-status-tracking/types/history.types.ts`
- `backend/src/lib/message-status-tracking/types/metrics.types.ts`
- `backend/src/lib/message-status-tracking/types/utils.ts` (type utilities)
- `backend/src/lib/message-status-tracking/types/index.ts` (barrel)
- `backend/src/lib/message-status-tracking/types/request.types.ts` (if exists)
- `backend/src/lib/message-status-tracking/types/response.types.ts` (if exists)

**Files to modify:**
- `backend/src/lib/message-status-tracking/types.ts` → replace with barrel re-export

**Steps:**

- [ ] **Step 3.1: Read the full types.ts file**

Read entire file to categorize all exports.

- [ ] **Step 3.2: Create enums.ts**

Move all `enum` declarations to `enums.ts`:
```typescript
export enum StatusChangeReason {
  CREATION = 'creation',
  QUEUE_PROCESSING = 'queue',
  WEBHOOK_UPDATE = 'webhook',
  ADMIN_MANUAL = 'admin',
  DLQ_TRANSFER = 'dlq',
  RETRY_EXHAUSTED = 'retry_exhausted',
  AUTOMATIC_RECOVERY = 'automatic_recovery',
  CANCELLATION = 'cancellation',
}

// Any other enums from the original file
```

- [ ] **Step 3.3: Create history.types.ts**

Move `StatusHistoryEntry`, `StatusHistoryQuery`, `PaginatedStatusHistory`:
```typescript
export interface StatusHistoryEntry {
  id: string;
  messageId: string;
  status: MessageStatus;
  changedAt: Date;
  changedBy: string | null;
  reason: StatusChangeReason;
  metadata?: Record<string, any>;
}

export interface StatusHistoryQuery {
  messageId: string;
  orgId: string;
  limit?: number;
  offset?: string;
  fromDate?: Date;
  toDate?: Date;
  status?: MessageStatus;
  reason?: StatusChangeReason;
}

export interface PaginatedStatusHistory {
  entries: StatusHistoryEntry[];
  total: number;
  nextOffset: string | null;
  hasMore: boolean;
}
```

- [ ] **Step 3.4: Create metrics.types.ts**

Move metrics-related types:
```typescript
export interface StatusDistribution {
  [status: string]: number;
}

export interface StatusTransitionCount {
  from: MessageStatus;
  to: MessageStatus;
  count: number;
}

export interface StatusMetrics {
  totalMessages: number;
  distribution: StatusDistribution;
  transitions: StatusTransitionCount[];
  averageTimeInStatus: Record<string, number>;
  updatedAt: Date;
}
```

- [ ] **Step 3.5: Create dto.types.ts and request/response.types.ts as needed**

Move any DTOs, request bodies, response types.

- [ ] **Step 3.6: Create utils.ts for type utilities**

Move type guards, helper types:
```typescript
export function isValidStatus(status: any): status is MessageStatus {
  return Object.values(MessageStatus).includes(status);
}
```

- [ ] **Step 3.7: Replace types.ts with barrel**

Modify `backend/src/lib/message-status-tracking/types.ts`:
```typescript
export * from './types/enums.js';
export * from './types/history.types.js';
export * from './types/metrics.types.js';
export * from './types/dto.types.js';
export * from './types/request.types.js';
export * from './types/response.types.js';
export * from './types/utils.js';
```

- [ ] **Step 3.8: Update all imports**

Search for imports from `'../../lib/message-status-tracking/types'` - they should continue working because barrel re-exports all types.

Internal imports within message-status-tracking module may need to be updated from `../types` to `./types` or removed.

- [ ] **Step 3.9: Type check and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/lib/message-status-tracking/types.ts backend/src/lib/message-status-tracking/types/
git commit -m "feat: split message-status-tracking/types.ts into categorized type modules"
```

---

### Task 4: Split lib/implement-message-deduplication-system/index.ts (277 lines)

**Pattern:** Service barrel - split into types, service, metrics, utils

**Files to create:**
- `backend/src/lib/implement-message-deduplication-system/types.ts` (move existing types)
- `backend/src/lib/implement-message-deduplication-system/deduplication.service.ts` (core logic)
- `backend/src/lib/implement-message-deduplication-system/metrics.service.ts` (Prometheus metrics)
- `backend/src/lib/implement-message-deduplication-system/cache.service.ts` (Redis caching if any)
- `backend/src/lib/implement-message-deduplication-system/index.ts` (barrel)

**Steps:**
- [ ] Read full file to identify all exports
- [ ] Extract enums/interfaces to types.ts
- [ ] Extract deduplication ID generation + checking to deduplication.service.ts
- [ ] Extract metrics collection to metrics.service.ts
- [ ] Extract any Redis caching helpers to cache.service.ts
- [ ] Replace index.ts with barrel re-exports
- [ ] Update internal imports
- [ ] Type check and commit

---

### Task 5: Split lib/implement-connection-pool-optimization/index.ts (197 lines)

**Already well-organized!** Just needs splitting into separate files:

**Files to create:**
- `backend/src/lib/implement-connection-pool-optimization/configuration.ts` (POOL_CONFIG)
- `backend/src/lib/implement-connection-pool-optimization/health.service.ts` (checkPoolHealth, runHealthCheckCycle)
- `backend/src/lib/implement-connection-pool-optimization/stats.service.ts` (getConnectionPoolStats)
- `backend/src/lib/implement-connection-pool-optimization/leak-detection.service.ts` (detectConnectionLeaks)
- `backend/src/lib/implement-connection-pool-optimization/shutdown.handler.ts` (shutdownConnectionPool)
- `backend/src/lib/implement-connection-pool-optimization/index.ts` (barrel)

**The file already has clear section comments - copy each section to its own file.**

---

### Task 6: Split lib/message-retry-and-dlq-system/retry-logic.operations.ts (176 lines)

**Files to create:**
- `backend/src/lib/message-retry-and-dlq-system/retry/retry-policy.service.ts` (getRetryPolicy, policy access)
- `backend/src/lib/message-retry-and-dlq-system/retry/retry-delay.service.ts` (calculateRetryDelay, exponential backoff)
- `backend/src/lib/message-retry-and-dlq-system/retry/retry-queue.operations.ts` (shouldRetry, enqueueRetry)
- `backend/src/lib/message-retry-and-dlq-system/retry/index.ts` (barrel)
- Update `backend/src/lib/message-retry-and-dlq-system/index.ts` to re-export from retry/

---

### Task 7: Split large type files (multiple)

**Batch process:**
- `lib/implement-message-deduplication-system/types.ts` (157 lines)
- `lib/integrate-evolution-api-message-status-webhooks/types/event-data.types.ts` (169 lines)
- `build-invoice-generation-&-download` already done, but verify completion

Apply Strategy C (type subdirectories) to each.

---

### Task 8: Split Route Files - Phase 1 (Largest: 200-334 lines)

**Start with the 8 largest route files (>250 lines each):**

1. `app/api/build-coupon-&-discount-system/route.ts` (334)
2. `app/api/enforce-2fa-for-privileged-roles/route.ts` (332)
3. `app/api/admin/features/route.ts` (332)
4. `app/api/build-billing-admin-dashboard/route.ts` (320)
5. `app/api/auth/route.ts` (283)
6. `app/api/whatsapp-instances/instance.crud.ts` (265)
7. `app/api/message-status-tracking/route.ts` (265)
8. `app/api/build-message-delivery-receipts-system/route.ts` (252)

For each, apply Strategy A:

- Create `handlers/` directory with one handler per route endpoint
- Create `schemas/` directory with one Zod schema per request body/query
- If business logic >50 lines, create `services/` and move it
- Replace route.ts with thin router registering handlers
- Update all imports (import { handler } from './handlers' instead of from './route')

**Detailed task for build-coupon-&-discount-system:**

- [ ] **Create handlers directory**
  - `create-coupon.handler.ts`
  - `get-coupon.handler.ts`
  - `list-coupons.handler.ts`
  - `apply-coupon.handler.ts`
  - `deactivate-coupon.handler.ts`
  - `get-coupon-usage.handler.ts`
  - `index.ts` (barrel)

- [ ] **Create schemas directory**
  - `create-coupon.schema.ts` (Zod object)
  - `apply-coupon.schema.ts`
  - `list-coupons.schema.ts` (query params)
  - `index.ts` (barrel)

- [ ] **Optionally create services/coupon.service.ts** if logic is heavy

- [ ] **Rewrite route.ts as router**

```typescript
import { FastifyInstance } from 'fastify';
import * as handlers from './handlers';
import { createCouponSchema, applyCouponSchema } from './schemas';

export async function registerCouponRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/', { schema: { body: createCouponSchema } }, handlers.createCouponHandler);
  fastify.get('/:code', handlers.getCouponHandler);
  fastify.get('/', handlers.listCouponsHandler);
  fastify.post('/apply', { schema: { body: applyCouponSchema } }, handlers.applyCouponHandler);
  fastify.delete('/:code', handlers.deactivateCouponHandler);
  fastify.get('/:code/usage', handlers.getCouponUsageHandler);
}
```

- [ ] **Update all code importing** `from '../../../lib/build-coupon-&-discount-system'` - they should not need changes because that's a different module. But any direct imports from the route file itself need updating.

Repeat this pattern for all 8 large route files.

---

### Task 9: Split Route Files - Phase 2 (Medium: 180-250 lines)

9 route files in this range:
- `implement-quota-enforcement-middleware/route.ts` (243)
- `add-whatsapp-message-throttling/route.ts` (215)
- `implement-card-updates-&-payment-method-management/route.ts` (205)
- `integrate-evolution-api-message-status-webhooks/route.ts` (196)
- `implement-connection-pool-optimization/route.ts` (192)
- `implement-message-queue-priority-system/route.ts` (184)
- `implement-usage-based-billing-&-overage/route.ts` (178)
- `implement-message-deduplication-system/route.ts` (172)
- `build-retry-logic-with-progressive-backoff/route.ts` (170)

Apply same Strategy A.

---

### Task 10: Split Route Files - Phase 3 (Remaining: 150-180 lines)

11 remaining route files:
- `chat-pagination/route.ts` (169)
- `webhook-dlq/route.ts` (156)
- `others as listed...`

---

### Task 11: Split remaining large lib/service files

- `lib/message-status-tracking/services/status-update.service.ts` (189)
- `lib/message-status-tracking/services/metrics.service.ts` (164)
- `lib/build-message-delivery-receipts-system/services/delivery.metrics.ts` (170)
- `lib/build-message-delivery-receipts-system/services/queries.service.ts` (162)
- `lib/implement-usage-based-billing-&-overage/usage.recorder.ts` (153)
- `lib/implement-card-updates-&-payment-method-management/payment.method.manager.ts` (153)
- `lib/chat-pagination/pagination.helpers.ts` (153)

Apply Strategy E: split each service into smaller focused services + barrel.

---

### Task 12: Split shared/middleware files

- `shared/middleware/orgGuard.ts` (164) - split into `orgGuard.middleware.ts` + `orgGuard.utils.ts`
- Already smaller than 200, but still could extract helpers

---

### Task 13: Final Verification & Cleanup

- [ ] **Run full TypeScript compilation**

```bash
cd backend
npx tsc --noEmit 2>&1 | tee /tmp/ts-errors.txt
```

Fix any and all type errors. Common issues:
- Missing named exports from barrels
- Incorrect file extensions (.ts vs .js in ESM imports)
- Circular dependencies created by splits

- [ ] **Run existing tests**

```bash
cd backend
npm test  # or pnpm test
```

All tests must pass. Fix any broken imports in tests.

- [ ] **Check for any remaining files >150 lines**

```bash
find backend/src -name "*.ts" -type f -exec wc -l {} + | awk '$1 > 150 {print}'
```

Should output nothing. If any remain, split them.

- [ ] **Generate final report**

```bash
cat <<EOF
## Modularization Complete

Total files split: 46
Files >150 lines remaining: 0
Total modules now: $(find backend/src -name "*.ts" | wc -l)
EOF
```

- [ ] **Final commit**

```bash
git add -A
git commit -m "refactor: complete systematic backend modularization - all files ≤150 lines"
```

---

## Testing Strategy

For each task/module:
1. **Compilation check** - `npx tsc --noEmit` must pass
2. **Import resolution** - Verify all imports resolve correctly
3. **Runtime smoke test** - If applicable, start the server and check endpoints
4. **Existing tests** - Run relevant test suites after each major phase

**Testing phases:**
- After Phase 1: Start server, hit `/health`, verify auth routes work
- After Phase 2: Test core lib functions (prisma queries, message queuing)
- After Phase 3: Type checking only (types don't need runtime tests)
- After each route phase: Test the specific API endpoints with curl/Postman or automated tests
- After Phase 5: Run full test suite

---

## Rollback Plan

If a split causes irreparable issues:
1. Each task is in its own commit
2. Use `git revert <commit-hash>` to undo that specific split
3. The revert restores the original monolith file

Keep commits small and focused to make rollback surgical.

---

## Success Criteria

✅ All 46 files reduced to ≤150 lines each
✅ TypeScript compilation passes with zero errors
✅ All existing tests pass
✅ No breaking changes - all public APIs accessible via barrel exports
✅ Code organization follows SRP (Single Responsibility Principle)
✅ New modules are intuitive and discoverable

---

## Estimated Effort

- **Phase 1 (Infrastructure):** 2-3 hours
- **Phase 2 (Core Libs):** 3-4 hours
- **Phase 3 (Types):** 2 hours
- **Phase 4 (Routes):** 8-12 hours (most time-consuming)
- **Phase 5 (Services):** 3-4 hours
- **Phase 6 (Verification):** 2 hours

**Total:** ~20-25 hours of focused development time (can be spread across multiple sessions)

---

## Notes

- This plan assumes the orchestrator follows established patterns from recent modularization commits (79bcdf6 and earlier)
- Order matters: split infrastructure first because it provides foundational APIs
- Types before routes because routes depend on type definitions
-创建 barrel exports at every level to preserve backward compatibility
- If a file is already well-organized like `implement-connection-pool-optimization/index.ts`, the split is straightforward copy-paste of sections into new files

---

**END OF PLAN**

```text
Plan complete and saved to `docs/superpowers/plans/2026-04-01-systematic-backend-modularization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
```
