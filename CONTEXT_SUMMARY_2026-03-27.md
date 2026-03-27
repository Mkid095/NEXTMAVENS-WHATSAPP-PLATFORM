# NEXTMAVENS WhatsApp Platform - Complete Project State Summary

**Date:** 2026-03-27
**Status:** Backend API operational, Evolution API container running, infrastructure partially configured
**Working Directory:** `/home/ken/NEXTMAVENS-WHATSAPP-PLATFORM`

---

## 1. SYSTEM ARCHITECTURE

### High-Level Architecture

```
Client → Nginx (HTTPS) → Backend API (Fastify, port 4930) → Evolution API (Docker, port 3001) → WhatsApp Cloud
                                 ↓
                       PostgreSQL (Prisma)
                                 ↓
                         Redis + BullMQ
```

### Services Currently Running

| Service | Status | Port | Purpose |
|---------|--------|------|---------|
| Backend API | ✅ Active (systemd) | 4930 | Fastify/TypeScript server |
| PostgreSQL | ✅ Running | 5432 | Primary database |
| Redis | ✅ Running | 6379 | Caching, rate limiting, BullMQ |
| Nginx | ✅ Running | 443/80 | Reverse proxy, SSL termination |
| Evolution API | ✅ Running | 3001 | WhatsApp gateway (Docker) |
| Frontend (React) | ⚠️ Build exists | 3001 conflict | Vite app (port conflict) |

**Port Conflict:** Both frontend and Evolution try to bind 127.0.0.1:3001. Frontend needs different port or host-only binding.

---

## 2. FOLDER/MODULE STRUCTURE (CURRENT)

### Backend Structure (`backend/src/`)

```
backend/src/
├── server.ts (557 lines) - Main entry point
├── middleware/
│   ├── auth.ts           - JWT authentication
│   ├── orgGuard.ts       - Multi-tenant guard
│   ├── rateLimit.ts      - Rate limiting wrapper
│   ├── quota.ts          - Quota enforcement wrapper
│   ├── throttle.ts       - Message throttling wrapper
│   └── enforce-2fa.ts    - 2FA check middleware
├── lib/ (34+ feature modules)
│   ├── prisma.ts - Database singleton
│   ├── rate-limiting-with-redis/
│   ├── implement-quota-enforcement-middleware/
│   ├── implement-idempotency-key-system/
│   ├── add-whatsapp-message-throttling/
│   ├── integrate-evolution-api-message-status-webhooks/
│   │   ├── handlers.ts (439 lines)
│   │   ├── parsers.ts (292 lines)
│   │   ├── signature.ts
│   │   ├── validator.ts
│   │   ├── index.ts (343 lines)
│   │   └── types.ts (287 lines)
│   ├── build-message-delivery-receipts-system/
│   ├── implement-connection-pool-optimization/
│   ├── message-queue-priority-system/
│   │   ├── consumer.ts (565 lines)
│   │   ├── producer.ts
│   │   ├── index.ts (253 lines)
│   │   └── types.ts (310 lines)
│   ├── message-retry-and-dlq-system/
│   │   ├── dlq.ts (506 lines)
│   │   ├── worker.ts
│   │   ├── maintenance.ts
│   │   ├── index.ts
│   │   ├── retry-policy.ts
│   │   └── types.ts (295 lines)
│   ├── message-status-tracking/
│   │   ├── status-manager.ts (656 lines) - TOO LARGE
│   │   ├── index.ts (480 lines)
│   │   └── types.ts
│   ├── chat-pagination/ (cursor-based)
│   ├── create-comprehensive-health-check-endpoint/
│   ├── create-comprehensive-metrics-dashboard-(grafana)/
│   ├── enforce-2fa-for-privileged-roles/
│   ├── build-immutable-audit-logging-system/
│   ├── implement-instance-heartbeat-monitoring/
│   │   ├── index.ts
│   │   ├── scheduler.ts
│   │   ├── status.ts
│   │   ├── storage.ts (297 lines)
│   │   └── types.ts
│   ├── feature-management/
│   ├── implement-usage-based-billing-&-overage/
│   │   ├── index.ts
│   │   ├── metrics.ts
│   │   ├── paystack-client.ts
│   │   ├── quota-calculator.ts
│   │   ├── usage-service.ts (301 lines)
│   │   └── types.ts
│   ├── build-invoice-generation-&-download/
│   │   ├── index.ts
│   │   ├── invoice-service.ts
│   │   ├── pdf-generator.ts
│   │   ├── storage.ts
│   │   └── validation.ts
│   ├── build-coupon-&-discount-system/
│   │   ├── index.ts (397 lines)
│   │   └── types.ts
│   ├── build-billing-admin-dashboard/
│   │   ├── index.ts (387 lines)
│   │   └── types.ts
│   ├── implement-card-updates-&-payment-method-management/
│   │   ├── index.ts (256 lines)
│   │   └── types.ts
│   ├── tax-integration/
│   ├── workflow-orchestration/
│   │   ├── engine.ts (546 lines)
│   │   ├── processor.ts (489 lines)
│   │   ├── index.ts (383 lines)
│   │   ├── compensation.ts (344 lines)
│   │   ├── queue.ts
│   │   ├── retry-policy.ts
│   │   └── types.ts (345 lines)
│   ├── evolution-api-client/ (NEW - THIS SESSION)
│   │   ├── client.ts (212 lines)
│   │   ├── types.ts (120 lines)
│   │   ├── errors.ts (48 lines)
│   │   ├── instance.ts (48 lines)
│   │   └── index.ts
│   └── [other modules...]
├── app/api/ (29 route modules)
│   ├── create-comprehensive-health-check-endpoint/route.ts
│   ├── integrate-evolution-api-message-status-webhooks/route.ts (196 lines)
│   ├── build-retry-logic-with-progressive-backoff/route.ts
│   ├── add-advanced-phone-number-validation/route.ts
│   ├── implement-message-deduplication-system/route.ts
│   ├── build-message-delivery-receipts-system/route.ts (252 lines)
│   ├── chat-pagination/route.ts
│   ├── rate-limiting-with-redis/route.ts (427 lines)
│   ├── implement-quota-enforcement-middleware/route.ts (243 lines)
│   ├── add-whatsapp-message-throttling/route.ts (215 lines)
│   ├── implement-instance-heartbeat-monitoring/
│   │   ├── instance.route.ts
│   │   └── admin.route.ts
│   ├── message-retry-and-dlq/route.ts (504 lines)
│   ├── webhook-dlq/route.ts
│   ├── build-immutable-audit-logging-system/route.ts
│   ├── enforce-2fa-for-privileged-roles/route.ts (332 lines)
│   ├── implement-connection-pool-optimization/route.ts (192 lines)
│   ├── workflow-orchestration/route.ts (605 lines)
│   ├── build-invoice-generation-&-download/route.ts (410 lines)
│   ├── build-coupon-&-discount-system/route.ts (334 lines)
│   ├── build-billing-admin-dashboard/route.ts (320 lines)
│   ├── implement-card-updates-&-payment-method-management/route.ts (205 lines)
│   ├── implement-usage-based-billing-&-overage/
│   │   ├── route.ts
│   │   └── admin.route.ts
│   ├── tax-integration/route.ts
│   ├── admin/features/route.ts
│   ├── message-status-tracking/route.ts (265 lines)
│   └── messages/ (NEW - THIS SESSION)
│       ├── index.ts
│       └── send/
│           ├── route.ts
│           └── schema.ts
├── test/ (36 test files in backend/src/test/)
│   ├── lib/
│   │   └── evolution-api-client/ (NEW)
│   │       └── client.test.ts (320 lines)
│   ├── app/api/
│   │   ├── workflow-orchestration.unit.test.ts (1476 lines - HUGE)
│   │   ├── workflow-orchestration.integration.test.ts (749 lines)
│   │   ├── rls.integration.test.ts (501 lines)
│   │   ├── 2fa-enforcement.integration.test.ts (521 lines)
│   │   ├── message-queue-priority-system.test.ts (275 lines)
│   │   ├── message-status-tracking.integration.test.ts (489 lines)
│   │   └── ... 30+ more
├── types/
│   └── fastify.d.ts
└── package.json
```

### Frontend Structure (src/ - duplicate code exists)

> **⚠️ CRITICAL ISSUE:** Frontend `src/lib/` and `src/middleware/` contain duplicate implementations of backend modules. This is incorrect - shared code should be in a monorepo packages/shared/.

```
src/
├── App.tsx
├── main.tsx
├── components/ (17 UI components)
├── pages/ (13 pages)
├── hooks/
├── lib/
│   ├── build-real-time-messaging-with-socket.io/ (DUPLICATE)
│   ├── integrate-evolution-api-message-status-webhooks/ (DUPLICATE)
│   ├── message-queue-priority-system/ (DUPLICATE)
│   ├── api.ts
│   ├── prisma.ts
│   ├── socket-client.ts
│   └── utils.ts
├── middleware/
│   ├── auth.ts (DUPLICATE)
│   ├── orgGuard.ts (DUPLICATE)
│   └── index.ts
└── test/ (7 test files - DUPLICATE & SCATTERED)
```

---

## 3. DATABASE SCHEMA (Prisma)

**Source of Truth:** `/prisma/schema.prisma` (828 lines)
**Duplicate:** `/backend/prisma/schema.prisma` (identical - needs consolidation)

### Core Models

```prisma
// Multi-tenancy
Organization { id, name, slug, email, taxRate, taxName, taxId, plan, paystackCustomerCode, createdAt, updatedAt }
Member { id, userId, orgId, role, createdAt }
User { id, email, password, name, avatar, role, isActive, mfaEnabled, mfaSecret, lastLogin, createdAt, updatedAt }

// WhatsApp Instances
WhatsAppInstance {
  id, orgId, name, phoneNumber (E.164, unique), qrCode, status (DISCONNECTED/CONNECTING/CONNECTED/RECONNECTING/ERROR),
  token, webhookUrl, isPrimary, createdAt, updatedAt, lastSeen, heartbeatStatus (ONLINE/OFFLINE/UNKNOWN)
}

// Messaging
WhatsAppMessage {
  id, orgId, instanceId, chatId, messageId (WhatsApp ID), parentMessageId, from, to,
  type (text/image/document/audio/video/location/button/template/reaction),
  content (Json), status (PENDING/SENDING/SENT/DELIVERED/READ/FAILED/REJECTED/CANCELLED),
  priority (0=normal, 1=high, -1=low), quotedData (Json), metadata (Json),
  sentAt, deliveredAt, readAt, failedAt, failureReason, createdAt, updatedAt
}

MessageStatusHistory {
  id, messageId, status, changedAt, changedBy (user ID or "system"), reason ("webhook"/"admin"/"queue"/"dlq"), metadata (Json)
}

WhatsAppChat {
  id, orgId, instanceId, chatId (WhatsApp chat ID), phone, name, avatar, lastMessageAt,
  unreadCount, isGroup, isArchived, isPinned, metadata (Json), createdAt, updatedAt
}

// Templates
WhatsAppTemplate {
  id, orgId, instanceId, name, language (default "en"), category (MARKETING/TRANSACTIONAL/UTILITY),
  status (DRAFT/PENDING_SUBMISSION/SUBMITTED/APPROVED/REJECTED/PAUSED),
  components (Json), variables (String[]), sampleData (Json), mediaUrl, quality, createdAt, updatedAt,
  approvedAt, rejectedAt, rejectionReason
}

// Agent & Assignment
WhatsAppAgent {
  id, orgId, userId, instanceId (optional), isActive, maxChats (default 10), createdAt
}

WhatsAppAssignment {
  id, orgId, instanceId, chatId, agentId, assignedAt, assignedBy (user ID)
  @@unique([chatId])  // One agent per chat
}

// Webhooks & DLQ
WebhookSubscription {
  id, orgId, instanceId, eventType, url, secret (HMAC), isActive, retryCount (default 3), createdAt
}

WebhookDeliveryLog {
  id, orgId, subscriptionId, eventId (unique for dedup), payload (Json),
  status (PENDING/DELIVERED/FAILED/RETRYING/DEAD),
  attempts, lastAttemptAt, errorMessage, nextRetryAt, createdAt
}

DeadLetterQueue {
  id, orgId, instanceId, event, payload (Json), error, retryCount (default 0), lastAttempted, createdAt
}

// Quotas & Billing
QuotaUsage {
  id, orgId, metric (messages_sent/active_instances/api_calls/storage_usage),
  value (BigInt), period (hourly/daily/monthly), periodStart (DateTime), createdAt, updatedAt
  @@unique([orgId, metric, period, periodStart])
}

Invoice {
  id, orgId, stripeInvoiceId (unique), number (e.g., INV-2025-001), amount (cents), currency (default USD),
  status (DRAFT/OPEN/PAID/VOID/UNCOLLECTIBLE), periodStart, periodEnd, dueDate, paidAt, pdfUrl, createdAt
}

InvoiceItem { id, invoiceId, orgId, description, quantity, unitPriceCents, totalCents, metadata (Json) }

Payment {
  id, orgId, stripePaymentId (unique), invoiceId (optional), amount, currency, status,
  methodType ("card"/"bank_transfer"), createdAt
}

PaymentMethod {
  id, orgId, authorizationCode (reusable Paystack code), last4, brand, expMonth, expYear,
  isDefault, createdAt, updatedAt
  @@unique([orgId, authorizationCode])
}

// Workflow Orchestration (Phase 3 Step 3)
WorkflowDefinition {
  id, workflowId (unique), name, description, version (default 1), stepsJson (Json),
  compensationJson (Json?), timeoutMs, retryPolicyJson (Json?), isActive (default true),
  createdBy (user ID), createdAt, updatedAt
}

WorkflowInstance {
  id, instanceId (unique), definitionId, definition (relation), status (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/COMPENSATING/COMPENSATED),
  currentStep (Int?), contextJson (Json), startedAt, completedAt, failedAt, failureReason,
  lastHeartbeatAt, orgId
}

WorkflowStepHistory {
  id, instanceId, stepIndex, stepName, status (PENDING/RUNNING/COMPLETED/FAILED/SKIPPED/COMPENSATED),
  startedAt, completedAt, failedAt, errorMessage, retryCount, inputJson, outputJson, metadata
}

// Usage Events (for usage-based billing)
UsageEvent {
  id, orgId, customerId (defaults to orgId), meterName, value (Float), recordedAt, metadata (Json)
}

// Feature Management (Phase 3 Step 8.5)
FeatureFlag {
  id, key (unique, e.g., "billing_enabled"), name, description, enabled (default false), createdAt, updatedAt
}

OrganizationFeatureFlag {
  id, orgId, featureKey, enabled (Boolean? - null=inherit, true=on, false=off), createdAt, updatedAt
  @@unique([orgId, featureKey])
}

// Coupons & Discounts (Phase 3 Step 9)
Coupon {
  id, code (unique), name, description, discountType ("percentage"/"fixed"), discountValue (Float),
  maxUses, usedCount (default 0), perUserLimit, minPurchaseAmount, validFrom, validTo,
  orgId, createdBy, isActive (default true), createdAt, updatedAt
}

CouponUsage {
  id, couponId, orgId, userId?, usedAt, orderId?
  @@unique([couponId, orgId, userId, orderId])
}
```

**Enums:** Role (SUPER_ADMIN, ORG_ADMIN, MANAGER, AGENT, VIEWER, API_USER, SYSTEM), Plan (FREE, STARTER, PRO, ENTERPRISE), InstanceStatus, HeartbeatStatus, MessageType, MessageStatus, TemplateCategory, TemplateStatus, WebhookDeliveryStatus, WorkflowStatus, WorkflowStepStatus, PaymentStatus, InvoiceStatus, QuotaMetric, QuotaPeriod

---

## 4. INFRASTRUCTURE SETUP

### Docker Compose (`docker-compose.yml`)

```yaml
services:
  whatsapp-frontend:
    image: nginx:alpine
    ports: "127.0.0.1:3001:80"  # ⚠️ PORT CONFLICT with Evolution
    networks: nextmavens_net
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./nginx-frontend.conf:/etc/nginx/conf.d/default.conf:ro

  evolution-api:
    image: atendai/evolution-api:v1.8.2
    container_name: nextmavens-whatsapp-evolution  # ✅ RUNNING
    ports: "127.0.0.1:3001:8080"  # ⚠️ Conflict with frontend on 3001
    environment:
      EVOLUTION_DATABASE_URL: postgres://nextmavens:...@172.17.0.1:5432/nextmavens_platform
      EVOLUTION_REDIS_URL: redis://172.17.0.1:6379
      EVOLUTION_AUTH_JWT_SECRET: ${JWT_SECRET}
      EVOLUTION_AUTH_JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      EVOLUTION_WEBHOOK_SECRET_KEY: ${EVOLUTION_WEBHOOK_SECRET}
      EVOLUTION_WEBHOOK_ENABLED: "true"
      EVOLUTION_WEBHOOK_URL: https://api.nextmavens.cloud/webhooks/whatsapp
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]

  whatsapp-redis:
    image: redis:7-alpine
    container_name: nextmavens-whatsapp-redis  # ✅ RUNNING
    command: redis-server --appendonly yes --maxmemory 32mb --maxmemory-policy allkeys-lru
    networks: nextmavens_net

  whatsapp-postgres:
    image: postgres:16-alpine
    container_name: nextmavens-whatsapp-postgres  # ✅ RUNNING
    environment:
      POSTGRES_USER: nextmavens
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: nextmavens_platform
    volumes:
      - whatsapp_postgres_data:/var/lib/postgresql/data
    networks: nextmavens_net

networks:
  nextmavens_net:
    external: true

volumes:
  whatsapp_redis_data:
  whatsapp_postgres_data:
```

### Current Container Status

```
nextmavens-whatsapp-evolution   Up  (port 127.0.0.1:3001->8080/tcp)  ⚠️ Port conflict
nextmavens-whatsapp-redis       Up  (port 6379/tcp)                ✅
nextmavens-whatsapp-postgres    Up  (port 5432/tcp, healthy)      ✅
nextmavens-whatsapp-frontend    Creating (blocked on port 3001)   ⚠️
```

### Backend Service (systemd)

**Service:** `whatsapp-backend.service`
**Status:** ✅ Active, running on port 4930
**Command:** `node /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/backend/dist/server.js` (or `npm run dev`)

### Nginx Configuration

Three sites configured:

1. `api.nextmavens.cloud` → 127.0.0.1:4930 (backend)
2. `webhook.nextmavens.cloud` → 127.0.0.1:4930 (webhook receiver)
3. Other subdomains (emails, flow) - likely frontend

All have security headers, rate limiting, gzip compression.

---

## 5. WHAT HAS BEEN IMPLEMENTED (THIS SESSION)

### Task: Build Evolution API Client & Message Sending Endpoint

**Goal:** Complete the outbound message flow (API → Backend → Evolution → WhatsApp)

#### 1. Added Dependencies
- Installed `axios` for HTTP client

#### 2. Created Evolution API Client (`backend/src/lib/evolution-api-client/`)

**Files:**
- `types.ts` (120 lines): TypeScript interfaces for Evolution API request/response types
- `errors.ts` (48 lines): Custom error classes
  - `EvolutionApiError` (base)
  - `EvolutionValidationError` (422)
  - `EvolutionAuthenticationError` (401)
  - `EvolutionRateLimitError` (429 with retryAfter)
  - `EvolutionNotFoundError` (404)
  - `EvolutionInstanceUnavailableError` (503)
- `client.ts` (212 lines): Main client class `EvolutionApiClient`
  - Constructor with config (baseUrl, apiKey, timeout)
  - Axios instance with interceptor for error mapping
  - Instance management methods:
    - `getInstance(instanceName)`
    - `listInstances()`
    - `createInstance(instanceName)`
    - `deleteInstance(instanceName)`
    - `restartInstance(instanceName)`
    - `logoutInstance(instanceName)`
    - `getQRCode(instanceName)`
    - `setWebhook(instanceName, url, enabled)`
  - Message sending methods:
    - `sendText(params)` → Evolution endpoint: `/message/sendText/:instanceId`
    - `sendMedia(params)` → `/message/sendImage/:instanceId`, etc.
    - `sendButtons(params)` → `/message/sendButtons/:instanceId`
    - `sendLocation(params)` → `/message/sendLocation/:instanceId`
    - `sendTemplate(params)` → `/message/sendTemplate/:instanceId`
  - Query methods:
    - `getQueueStatus(instanceId)`
    - `fetchMessage(messageId)`
    - `deleteMessage(instanceId, messageId)`
    - `fetchChats(instanceId, sort?, limit?)`
    - `fetchChatMessages(instanceId, chatId, sort?, limit?)`
    - `markChatAsRead(instanceId, chatId, lastMessageId)`
- `instance.ts` (48 lines): Singleton pattern
  - `getEvolutionClient()` - lazy singleton getter
  - `initializeEvolutionClient()` - validates connection by calling `listInstances()`
- `index.ts`: Exports all public APIs

#### 3. Created Messages API (`backend/src/app/api/messages/`)

**Files:**
- `index.ts`: Plugin entry point that calls `registerMessagesRoutes(fastify)`
- `send/route.ts`: POST `/api/v1/messages/send` endpoint
  - Full middleware stack (global: auth, orgGuard, rateLimit, quota, throttle, idempotency)
  - Validates request body via Zod schema `sendMessageSchema`
  - Extracts `orgId` and `userId` from request (set by auth middleware)
  - Verifies WhatsApp instance belongs to the user's org
  - Builds `content` JSON based on message type (text, media, buttons, location, template)
  - Creates `WhatsAppMessage` record in DB with status `PENDING`
  - Calls appropriate Evolution API method
  - On success: updates message with Evolution's `messageId`, status `SENDING`, `sentAt`
  - Emits Socket.io event `message:sent` to org room via `socketService.broadcastToOrg(orgId, ...)`
  - On Evolution error: marks message as `FAILED` with `failureReason`, returns 502
  - Returns: `{ success: true, data: { messageId, evolutionMessageId, status, sentAt } }`
- `send/schema.ts`: Comprehensive Zod schemas
  - `sendTextMessageSchema`: type=text, content (1-4096 chars), optional quotedMessageId, mentions
  - `sendMediaMessageSchema`: type=image/video/audio/document, media (base64 or URL), optional caption, fileName, mimetype, quotedMessageId
  - `sendButtonsMessageSchema`: type=buttons, title (1-200), description (max 1024), footer (max 200), buttons array (1-3 buttons, each with id, text 1-200, type=reply|url|call|location, optional value)
  - `sendLocationMessageSchema`: type=location, latitude (-90 to 90), longitude (-180 to 180), optional name (max 200), address (max 500), quotedMessageId
  - `sendTemplateMessageSchema`: type=template, templateName (1-100), language (1-10, default "en"), optional components array with header/body/button/footer, each with parameters (text, currency, date_time, image/video/document/location)
  - `sendMessageSchema`: Discriminated union by `type` field
  - **Issue:** Schema uses `type` property name which conflicts with Prisma's `MessageType` enum. Need to rename to `componentType` in template components.

#### 4. Updated Backend Server (`backend/src/server.ts`)

- Added import: `import { initializeEvolutionClient } from './lib/evolution-api-client/instance.ts';`
- Added Evolution client initialization after feature flags (lines ~110-120):
  ```ts
  try {
    await initializeEvolutionClient();
    console.log('[EvolutionAPI] Client initialized and connection verified');
  } catch (error) {
    console.error('[EvolutionAPI] Initialization failed:', error);
    // Fail open - allow server to start even if Evolution is down
  }
  ```
- Registered messages routes after chat pagination (lines ~345-348):
  ```ts
  const messagesRoutes = await import('./app/api/messages/index.js');
  await app.register(messagesRoutes.default || messagesRoutes, { prefix: '/api/v1' });
  console.log('[SERVER] Messages send routes registered');
  ```

#### 5. Added Unit Test

- `backend/src/test/lib/evolution-api-client/client.test.ts` (320 lines)
  - Tests: constructor, getInstance, listInstances, createInstance, sendText, sendMedia, sendButtons, sendLocation, sendTemplate, getQueueStatus
  - Error handling tests: EvolutionAuthenticationError (401), EvolutionRateLimitError (429)
  - Uses Jest with axios mocked

#### 6. Modified Files

- `backend/package.json`: Added `axios` dependency
- `backend/src/server.ts`: Evolution init + route registration
- `backend/src/lib/evolution-api-client/index.ts`: Exports singleton

---

## 6. CONFIGURATION FILES

### Backend `.env` (incomplete - needs update)

```bash
DATABASE_URL="postgresql://nextmavens_app:app_secure_password_2026@localhost:5432/nextmavens_research?connection_limit=1&pool_timeout=10"
JWT_SECRET="C5eRwrMNSfjwNyinKAy+T5oE6d/r0tCONkzvXZXyYzc="
JWT_REFRESH_SECRET="your-refresh-secret-key-change-this-too-min-256-bits"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
REDIS_URL="redis://localhost:6379"
EVOLUTION_API_URL="http://localhost:3001"
EVOLUTION_API_KEY="your-evolution-api-key"   # ⚠️ MUST UPDATE to actual key
EVOLUTION_WEBHOOK_SECRET="BhNFZ+vnaGSnFJRNhhYpxsyJ4LYraZoXv1gXxPsIqhU="
PORT=4930
NODE_ENV="development"
LOG_LEVEL="info"

# Message Retry & DLQ
ENABLE_RETRY_DLQ="false"
MESSAGE_RETRY_MAX_ATTEMPTS="5"
MESSAGE_RETRY_BASE_DELAY_MS="1000"
MESSAGE_RETRY_MAX_DELAY_MS="300000"
MESSAGE_RETRY_JITTER="0.15"
DLQ_RETENTION_DAYS="30"
DLQ_STREAM_PREFIX="dlq:whatsapp"

# Queue Configuration
QUEUE_CONCURRENCY="10"

# Workflow Orchestration
ENABLE_WORKFLOW_ORCHESTRATION="true"
WORKFLOW_MAX_RETRIES="3"
WORKFLOW_BASE_RETRY_DELAY_MS="1000"
WORKFLOW_TIMEOUT_DEFAULT_MS="3600000"
```

### Evolution API Container Environment (Actual Values)

```bash
EVOLUTION_AUTH_JWT_SECRET=o0/lef0FpSXo8lRYpAuakROi5D6Z6DQRsn+PADUVRXTiV9w4mqNsAEWsGiRwilOBSyHgv/676+QzSOxbcJ6Gqg==
EVOLUTION_AUTH_JWT_REFRESH_SECRET=y6CWu0uOogD5oJ7UbZEWtW4r5uqK954Pn5/cbpgoqDSHRXtE+aZ48LvihdfGh3PDWt67xiE8pO4Icx9ESUMakw==
EVOLUTION_WEBHOOK_SECRET_KEY=9/eXxIZ5nJ7IPtklbP/EhXsH6xm6jKDXClPxnjbb+QQzOjDSdErGh5Dqpoa8YpNWJ3/+VL/EF2XpVWVe4GXhmA==
AUTHENTICATION_API_KEY=B6D711FCDE4D4FD5936544120E713976  # ✅ GLOBAL API KEY
```

**Action:** Copy `AUTHENTICATION_API_KEY` value to `.env` as `EVOLUTION_API_KEY`.

### Nginx Configuration

Sites configured:
- `api.nextmavens.cloud` → upstream `127.0.0.1:4930`
- `webhook.nextmavens.cloud` → upstream `127.0.0.1:4930`

Both include rate limiting, security headers, gzip.

---

## 7. BUILD STATUS & REMAINING ERRORS

### TypeScript Compilation Errors (17 total in full build)

**Errors in our new code:**

1. **`route.ts:106`** - Property 'quotedMessageId' does not exist on union type
   - **Root Cause:** Prisma model uses `quotedData` (JSON field), not `quotedMessageId`
   - **Fix:** Change to `quotedData: validated.quotedMessageId ? { messageId: validated.quotedMessageId } : null`

2. **`route.ts:177`** - Duplicate type: Two different types with this name exist, but they are unrelated
   - **Root Cause:** Zod schema's template component uses `type: z.enum(['header', 'body', 'button', 'footer'])` which conflicts with the `type` property from discriminated union (text/image/etc)
   - **Fix:** Rename component property to `componentType` in schema, or use explicit type assertion in route handler

3. **Plugin registration in `server.ts:364`** - Type mismatch for Fastify plugin
   - **Root Cause:** TypeScript cannot reconcile `messagesRoutes.default || messagesRoutes` with expected FastifyPlugin type
   - **Fix:** Add `// @ts-ignore` comment before register call, or explicitly cast to `any`

**Other existing errors in codebase (not our fault, blocking full build but not runtime):**
- Coupon discountType enum mismatch (string vs `DiscountType`)
- Paystack client type errors (unknown response shapes)
- Various other legacy errors in billing modules (commented out routes)

---

## 8. OUTSTANDING TASKS & NEXT STEPS

### Immediate Fixes Required (Before Testing)

1. **Fix message creation `quotedData` field** in `route.ts`
   - Replace `quotedMessageId: validated.quotedMessageId` with `quotedData: validated.quotedMessageId ? { messageId: validated.quotedMessageId } : null`

2. **Fix schema type conflict** in `schema.ts`
   - Rename `type` property in template components to `componentType` (or other distinct name)
   - Update corresponding route logic to use new property name

3. **Fix server.ts plugin registration**
   - Add `// @ts-ignore` before the `await app.register(...)` line for messages
   - OR cast: `await app.register((messagesRoutes.default || messagesRoutes) as any, { prefix: '/api/v1' });`

4. **Update `.env`** with actual Evolution API key from container (`AUTHENTICATION_API_KEY` value)

5. **Restart backend** to load changes:
   ```bash
   systemctl --user restart whatsapp-backend.service
   # or
   npm run dev
   ```

6. **Run unit test** to verify Evolution client:
   ```bash
   npm test -- src/test/lib/evolution-api-client/client.test.ts
   ```

7. **Verify route registration**: Check server logs for `[Messages] POST /api/v1/messages/send - registered`

### Integration Testing (After Fixes)

1. **Connect WhatsApp instance** (if not already):
   - Get QR code: `curl "http://localhost:3001/instance/connect/main" -H "apikey: C0C4F2F2-90A0-4ACA-8A6A-57838D8D797C" | jq -r '.base64' > /tmp/qr.png`
   - Scan with WhatsApp mobile app

2. **Test message sending**:
   - Obtain JWT token for test user (use existing seed or create via auth endpoints)
   - POST to `/api/v1/messages/send`:
     ```json
     {
       "instanceId": "c83f8d9e-e42f-4743-a5f5-9b85a14ec029",
       "to": "+1234567890",
       "type": "text",
       "content": "Hello from NEXTMAVENS!"
     }
     ```
   - Expect: `200 { success: true, data: { messageId, evolutionMessageId, status: "SENDING", sentAt } }`
   - Verify: Message record created in DB (`SELECT * FROM "WhatsAppMessage" WHERE id = ...`)
   - Verify: Evolution API received call (check Evolution logs or queue: `GET /message/getQueueMessages/{instanceId}`)
   - Verify: Webhook from Evolution updates message status to `SENT`/`DELIVERED`/`READ`
   - Verify: Socket.io `message:sent` event emitted to org room

3. **Test error handling**:
   - Invalid phone number → 400
   - Instance not belonging to org → 404
   - Evolution API down → 502 with error details
   - Duplicate request (same Idempotency-Key) → cached response

### Optional Enhancements (After Core Works)

1. Add circuit breaker to Evolution client (Phase 2 Step 11)
2. Add retry with progressive backoff in client (already has error handling)
3. Add comprehensive integration tests for messages endpoint
4. Refactor `message-status-tracking/status-manager.ts` (656 lines > 250 limit)
5. Consolidate duplicate frontend/backend code into shared package
6. Fix port conflict: stop frontend container or change its port
7. Implement Phase 2 Step 10 (load testing) with k6 or artillery
8. Implement Phase 2 Step 12 (message replay & recovery system)
9. Implement Phase 2 Step 13 (adaptive rate limit adjustment)
10. Decide on billing strategy: integrate Stripe or defer Phase 3 (currently blocked)

---

## 9. IMPORTANT CONSTRAINTS & ARCHITECTURAL RULES

1. **Multi-tenancy first** - All DB queries must be scoped by `orgId` from JWT
2. **RLS enforced** at database level - Never rely solely on app-level filtering
3. **No emojis** in code, comments, logs, docs (strict rule)
4. **Primary colors only** for UI: #3B82F6 (blue), #10B981 (green), #F59E0B (amber), #EF4444 (red)
5. **Max file lines: 250** (enforced by linter? - currently violated by several files)
6. **Feature-based module structure** (each module in own folder with index.ts, types.ts, tests)
7. **Idempotency required** for all write operations (use Idempotency-Key header)
8. **All external API calls** must have circuit breakers (currently missing for Evolution outbound)
9. **Audit log** every data-modifying action (immutable, append-only)
10. **Webhooks** must be signature-verified (HMAC-SHA256) ✅

### Coding Conventions

- TypeScript strict mode
- Fastify framework (hapi-style)
- Prisma ORM with connection pooling
- Redis for cache, rate limiting, BullMQ
- Zod for validation
- Socket.io for real-time
- Feature modules co-located: `lib/<feature-name>/` + `app/api/<feature-name>/`
- Middleware order in `server.ts` preHandler: auth → orgGuard → 2FA → rateLimit → quota → throttle → idempotency

### Dependencies (Backend)

```json
{
  "dependencies": {
    "@fastify/cors": "^8.5.0",
    "@fastify/helmet": "^11.1.1",
    "@fastify/rate-limit": "^8.0.3",
    "@prisma/adapter-pg": "^7.5.0",
    "@socket.io/redis-adapter": "^8.3.0",
    "bullmq": "^5.13.0",
    "fastify": "^4.28.1",
    "fastify-raw-body": "^4.2.0",
    "jsonwebtoken": "^9.0.2",
    "libphonenumber-js": "^1.12.39",
    "pdfkit": "^0.18.0",
    "prom-client": "^15.1.3",
    "qrcode": "^1.5.4",
    "redis": "^4.7.0",
    "socket.io": "^4.8.1",
    "speakeasy": "^2.0.0",
    "zod": "^4.3.6",
    "axios": "^1.6.0"  // ← ADDED THIS SESSION
  },
  "devDependencies": {
    "@jest/globals": "^29.7.0",
    "@prisma/client": "^6.19.2",
    "@types/jest": "^29.5.14",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^22.14.0",
    "jest": "^29.7.0",
    "prisma": "^6.19.2",
    "socket.io-client": "^4.8.3",
    "ts-jest": "^29.4.6",
    "tsx": "^4.19.2",
    "typescript": "~5.8.2"
  }
}
```

---

## 10. EVOLUTION API INTEGRATION STATUS

### Current State

- Container: `nextmavens-whatsapp-evolution` running
- Port: `localhost:3001` → container `8080/tcp`
- Health: HTTP ON:8080, root returns welcome message
- Store: File-based at `/evolution/store/` (no database needed)

### Instance Created

```json
{
  "instanceName": "main",
  "instanceId": "c83f8d9e-e42f-4743-a5f5-9b85a14ec029",
  "status": "connecting",
  "apikey": "C0C4F2F2-90A0-4ACA-8A6A-57838D8D797C"
}
```

- QR Code: Generated (base64 PNG) - ready to scan with WhatsApp
- Connection Status: `connecting` → needs QR scan to become `open`

### What's Working

- ✅ Evolution API reachable at `http://localhost:3001`
- ✅ Instance creation via `POST /instance/create`
- ✅ Instance listing via `GET /instance/fetchInstances`
- ✅ QR code generation

### What's Missing (to complete this feature)

- ❌ Outbound message sending service in backend (**IN PROGRESS** - this session)
- ❌ Group/contact/chat management APIs wrapped
- ❌ Webhook configuration endpoint used (`/webhook/set/{instance}`) - may need to call to register backend webhook URL

---

## 11. PHASE COMPLETION STATUS (JSON TRACKING FILES)

Files: `phase1.json`, `phase2.json`, `phase3.json`, `phases.json`
Note: These are tracking files likely created by AI agent. Should be gitignored or moved to `.claude/`.

- `phase1.json`: Should show 14/14 completed. Step 13 (Chat Pagination) code exists, may need JSON update.
- `phase2.json`: Steps 1-9 marked "COMPLETED" (code exists). Steps 10-14: "NOT_STARTED" (correctly).
- `phase3.json`: Only Step 3 (Workflow Orchestration) marked "COMPLETED". Steps 4-9 exist but commented out → should be "BLOCKED: Requires Stripe integration".

---

## 12. GAPS & MISSING IMPLEMENTATION

### Critical Missing Features

1. **Outbound Evolution API Client** - **IN PROGRESS** (this session)
   - Service created but has TypeScript errors blocking compilation
   - Needs fixes (quotedData, schema conflict, plugin registration)
   - Missing circuit breaker (architectural rule #8)

2. **Stripe Integration (Phase 3 Billing)**
   - `stripe` package not installed
   - All billing routes commented out in `server.ts` (lines 420-460)
   - `.env` has placeholder keys
   - Decision needed: Integrate Stripe or defer Phase 3

3. **Load Testing (Phase 2 Step 10)**
   - No load test suite
   - Should use k6 or artillery

4. **Circuit Breaker Pattern (Phase 2 Step 11)**
   - No circuit breaker protecting Evolution API calls
   - Need: `lib/circuit-breaker/` or oauthress/cockatiel implementation

5. **Message Replay & Recovery (Phase 2 Step 12)**
   - DLQ exists but no replay mechanism
   - Need admin UI to retry failed messages
   - Batch replay with filters (org, instance, time range)

6. **Adaptive Rate Limiting (Phase 2 Step 13)**
   - Static rate limits only
   - Need dynamic adjustment based on system load, error rates

7. **Chaos Engineering (Phase 2 Step 14)**
   - No fault injection testing
   - Should test: network partitions, Redis down, Postgres slow queries, Evolution timeouts

### Code Quality Issues

- 50+ files > 250 lines (violates project max line rule)
- Feature folders named after tasks (e.g., `implement-card-updates-&-payment-method-management/`) should be domain names: `payment-methods/`, `coupons/`, `billing/`
- Duplicated code between `backend/src/` and frontend `src/` (webhook parsers, middleware)
- Scattered tests - 36 test files in `backend/src/test/` plus loose `.mjs` scripts in root
- Two Prisma schemas (`/prisma/` and `/backend/prisma/`) - risk of drift
- Root clutter - 30+ Markdown docs, phase*.json tracking files, `*.backup-*` files

---

## 13. FILES CHANGED (Git Status)

```
M backend/package-lock.json
M backend/package.json          (added axios)
M backend/src/server.ts         (Evolution init + route register)
M docker-compose.yml            (maybe - verify)
D phase1.json.backup
D phase1_clean.json
?? backend/src/app/api/messages/    (new - 3 files)
?? backend/src/lib/evolution-api-client/  (new - 5 files)
?? backend/src/test/lib/evolution-api-client/  (new test - 1 file)
?? backend/src/server.ts.backup-1774588341
?? docs/superpowers/              (plan output)
```

Total new files: **9**
Total modified: **3** (plus backups)

---

## 14. DESIGN DECISIONS MADE (This Session)

- Evolution client uses **singleton pattern** with lazy init (`getEvolutionClient()`)
- Message send endpoint is **idempotent** (uses global Idempotency-Key middleware)
- Real-time notification via **Socket.io** to org room `org-{orgId}`
- Message content stored as **JSON** in Prisma `content` field with type-specific keys
- Schema uses **discriminated union** to enforce type-specific fields per message type
- Evolution message ID mapping stored in `WhatsAppMessage.messageId`
- Quoted replies stored in `quotedData` JSON (per Prisma schema): `{ messageId: string }`

---

## 15. VERIFICATION CHECKLIST (For Next Session)

Before proceeding, verify:

- [ ] Backend compiles without errors (`npm run build`)
- [ ] Backend starts successfully (`npm run dev` or systemd)
- [ ] Evolution client initializes (logs: `[EvolutionAPI] Client initialized`)
- [ ] POST `/api/v1/messages/send` responds (200 success)
- [ ] Message record created in DB
- [ ] Evolution API receives call (check Evolution logs or `/message/getQueueMessages/{instance}`)
- [ ] Webhook from Evolution updates message status (check DB `status` changes)
- [ ] Socket.io client receives `message:sent` event (if connected)
- [ ] Unit test passes: `npm test -- src/test/lib/evolution-api-client/client.test.ts`

---

## 16. IMMEDIATE NEXT ACTIONS (Ordered)

1. **Fix compilation errors** in `backend/src/app/api/messages/send/route.ts`:
   - Line 106: Change `quotedMessageId` → `quotedData: validated.quotedMessageId ? { messageId: validated.quotedMessageId } : null`
   - Schema: Rename component `type` to `componentType` (update schema and route)
   - Server.ts line 364: Add `// @ts-ignore` before register call

2. **Update `.env`**: Set `EVOLUTION_API_KEY=C0C4F2F2-90A0-4ACA-8A6A-57838D8D797C` (from Evolution container)

3. **Recompile**: `npm run build` (should succeed)

4. **Restart backend**: `systemctl --user restart whatsapp-backend.service` (or `npm run dev`)

5. **Run unit test**: `npm test -- src/test/lib/evolution-api-client/client.test.ts` (should pass)

6. **Test message sending** with curl (after obtaining JWT token)

7. **Connect WhatsApp instance**: Scan QR code from `GET /api/instances/main/qrcode` (if instance exists)

8. **Verify end-to-end flow**: Message → DB → Evolution → Webhook → DB status update → Socket.io

9. **Consider adding circuit breaker** to Evolution client (architectural requirement)

10. **Document completion**: Update phase JSON files to reflect new feature completion

---

## END OF SUMMARY

**Session Time:** 2026-03-27
**Next Context Should Resume:** Immediately after this summary, with focus on fixing the 3 TypeScript errors to unblock compilation and testing.

All relevant file paths, code structure, configuration values, and next steps documented.
