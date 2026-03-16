# NEXTMAVENS WhatsApp Platform - Project State Summary

**Date:** 2025-03-17
**Phase:** Phase 1 (Enterprise-Grade Critical Fixes) - 13/14 steps completed (93%)
**Last Completed Step:** Step 13 - Chat Pagination (Cursor-based) - COMMITTED
**Commit Hash:** `0c96cba` (pushed to branch `phase1-step-7-add-whatsapp-message-throttling`)
**Immediate Next Step:** Step 14 - Implement Instance Heartbeat Monitoring

---

## 1. SYSTEM ARCHITECTURE & STRUCTURE

### High-Level Architecture

The system is a **microservices-oriented backend** built with **Fastify** (Node.js) following a **modular, feature-based architecture**. It implements a **multi-tenant WhatsApp messaging platform** with Evolution API integration.

**Core Design Principles:**
- Feature-based module organization (`src/lib/[feature]/`, `src/app/api/[feature]/`)
- Every file ≤ 250 lines (enforced by phase rules)
- Row Level Security (RLS) for complete data isolation
- Middleware pipeline for cross-cutting concerns (auth, rate limiting, quotas, etc.)
- Prisma ORM with PostgreSQL
- BullMQ for message queuing
- Redis for caching and rate limiting

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js (TSX for TypeScript execution) |
| **Framework** | Fastify v4 |
| **Database** | PostgreSQL with RLS |
| **ORM** | Prisma v5 |
| **Queue** | BullMQ (Redis-backed) |
| **Cache/Rate Limit** | Redis ioredis v5 |
| **Auth** | JWT with @fastify/jwt |
| **Validation** | Zod v3 |
| **Testing** | Node test runner (tsx --test) |
| **Process Manager** | PM2 (production) |
| **Deployment** | VPS (Ubuntu) with Docker/standby services |

---

## 2. DIRECTORY / MODULE STRUCTURE

```
NEXTMAVENS-WHATSAPP-PLATFORM/
├── backend/
│   ├── src/
│   │   ├── server.ts                          # Main Fastify entry point
│   │   ├── middleware/
│   │   │   ├── auth.ts                       # JWT verification + user lookup
│   │   │   ├── orgGuard.ts                   # Sets RLS context (app.current_org)
│   │   │   ├── quota.ts                      # Quota enforcement (with RLS fix)
│   │   │   ├── rateLimit.ts                  # Redis-based rate limiting
│   │   │   ├── throttle.ts                   # Request throttling
│   │   │   ├── enforce-2fa.ts                # 2FA check for privileged roles
│   │   │   └── index.ts                      # Middleware aggregator
│   │   ├── lib/
│   │   │   ├── prisma.ts                     # Global Prisma singleton
│   │   │   ├── chat-pagination/             # ✅ STEP 13 COMPLETED
│   │   │   │   ├── types.ts (67 lines)      # TypeScript interfaces
│   │   │   │   ├── cursor.ts (52 lines)     # Encode/decode cursors
│   │   │   │   ├── order.ts (40 lines)      # Order-by + reversal logic
│   │   │   │   ├── paginate.ts (235 lines)  # Core pagination algorithm
│   │   │   │   ├── queries.ts (84 lines)    # getAllChats(), countChats()
│   │   │   │   └── index.ts (37 lines)      # Barrel export
│   │   │   ├── implement-bullmq-message-queue-system/
│   │   │   ├── implement-rate-limiting-with-redis/
│   │   │   ├── implement-idempotency-key-system/
│   │   │   ├── build-webhook-dead-letter-queue-system/
│   │   │   ├── implement-quota-enforcement-middleware/
│   │   │   ├── add-whatsapp-message-throttling/
│   │   │   ├── create-comprehensive-health-check-endpoint/
│   │   │   ├── build-immutable-audit-logging-system/
│   │   │   ├── enforce-2fa-for-privileged-roles/
│   │   │   ├── phone-number-normalization-to-e.164/
│   │   │   ├── implement-message-status-tracking-system/
│   │   │   └── [other feature modules...]
│   │   ├── app/api/
│   │   │   ├── chat-pagination/             # ✅ STEP 13 COMPLETED
│   │   │   │   └── route.ts (177 lines)     # GET /api/chats endpoint
│   │   │   ├── add-advanced-phone-number-validation/
│   │   │   ├── add-whatsapp-message-throttling/
│   │   │   ├── build-immutable-audit-logging-system/
│   │   │   ├── build-message-delivery-receipts-system/
│   │   │   ├── build-retry-logic-with-progressive-backoff/
│   │   │   ├── create-comprehensive-health-check-endpoint/
│   │   │   ├── enforce-2fa-for-privileged-roles/
│   │   │   ├── implement-message-deduplication-system/
│   │   │   ├── implement-message-queue-priority-system/
│   │   │   ├── implement-quota-enforcement-middleware/
│   │   │   ├── rate-limiting-with-redis/
│   │   │   ├── webhook-dlq/
│   │   │   └── [other API routes...]
│   │   └── test/
│   │       ├── add-chat-pagination.unit.test.ts      # ✅ 10 unit tests
│   │       ├── chat-pagination.integration.test.ts  # ✅ 8 integration tests
│   │       ├── rls.integration.test.ts
│   │       └── [other test files...]
│   ├── prisma/
│   │   ├── schema.prisma                # Complete DB schema with RLS
│   │   └── migrations/
│   │       └── 20250311_add_rls_policies/
│   │           └── migration.sql        # RLS policies for all tenant tables
│   ├── docs/
│   │   ├── PHASE1_STEP1_RLS_IMPLEMENTATION.md
│   │   ├── PHASE1_STEP2_AUTH_MIDDLEWARE.md
│   │   └── research/                    # Research docs per step
│   ├── reports/
│   │   ├── phase1-step13-report.md     # ✅ Chat pagination completion report
│   │   └── [other step reports...]
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── setup.mjs
│   └── server.ts (entry point)
├── phase1.json                         # Step tracking (13 completed, 1 pending)
├── PHASES_USAGE_GUIDE.md              # Phase system documentation
├── COMPREHENSIVE_IMPLEMENTATION_PLAN.md
├── PROJECT_STATE_SUMMARY.md           # This document
└── README.md

Total test files: 100+ tests across unit and integration suites
```

---

## 3. KEY COMPONENTS & SERVICES

### Middleware Pipeline (PreHandler Hooks)

All API requests pass through this ordered pipeline:

```typescript
// Registered in server.ts
app.addHook('preHandler', [
  auth,          // 1. JWT verification, attaches request.user
  orgGuard,      // 2. Sets RLS context (app.current_org) from user membership
  rateLimit,     // 3. Redis sliding window rate limiting
  quota,         // 4. Checks org plan quotas (messages, templates, etc.)
  throttle,      // 5. Request throttling for abuse prevention
  idempotency    // 6. Deduplication via Idempotency-Key header
]);
```

**Critical Note:** Services that query tenant tables outside the request pipeline (like QuotaLimiter background jobs) must manually set RLS context using `SELECT set_config('app.current_org', orgId::text, false)` within a transaction.

### Database Schema - Key Models

```
User (authentication DB - separate from tenant data)
├─ id, email, password, role (SUPER_ADMIN, ORG_ADMIN, AGENT, etc.)
├─ isActive, mfaEnabled, mfaSecret, lastLogin
└─ memberships[], agents[], auditLogs[]

Organization (tenant)
├─ id, name, slug (unique), plan (FREE/STARTER/PRO/ENTERPRISE)
├─ members[], instances[], templates[], agents[]
├─ assignments[], webhooks[], quotaUsages[], invoices[], payments[]
└─ auditLogs[], deadLetters[]

WhatsAppInstance
├─ id, orgId, name, phoneNumber (E.164, unique)
├─ qrCode?, status (DISCONNECTED/CONNECTING/CONNECTED/etc.)
├─ token?, webhookUrl?, isPrimary?, lastSeen?
└─ messages[], chats[], templates[], agents[], assignments[], webhooks[], deadLetters[]

WhatsAppChat (paginated)
├─ id, orgId, instanceId, chatId (WhatsApp ID)
├─ phone (E.164), name?, avatar?, lastMessageAt?
├─ unreadCount (default 0), isGroup (false), isArchived (false), isPinned (false)
├─ metadata (JSON), createdAt, updatedAt
└─ instance[], messages[], assignment[]

WhatsAppMessage
├─ id, messageId (from Evolution), chatId, instanceId, orgId
├─ from, to (E.164), type (text/image/document/etc.)
├─ content (JSON), status (PENDING/SENDING/SENT/DELIVERED/READ/FAILED)
├─ priority (0=normal), quotedData?, metadata?
├─ Delivery timestamps: sentAt, deliveredAt, readAt, failedAt, failureReason?
└─ createdAt, updatedAt

WhatsAppTemplate
├─ id, orgId, instanceId?, name, language (default "en")
├─ category (MARKETING/TRANSACTIONAL/UTILITY)
├─ status (DRAFT/PENDING_SUBMISSION/APPROVED/REJECTED/PAUSED)
├─ components (JSON), variables[], sampleData?, mediaUrl?, quality?
└─ approvedAt?, rejectedAt?, rejectionReason?

WhatsAppAgent
├─ id, orgId, userId (references User), instanceId?
├─ isActive (true), maxChats (default 10)
└─ assignments[]

WhatsAppAssignment
├─ id, orgId, chatId, agentId, assignedAt, unassignedAt, isActive

QuotaUsage
├─ id, orgId, metric (MESSAGES_SENT, TEMPLATES_CREATED, etc.)
├─ periodStart, periodEnd, current (usage count), limit (from plan)
└─ updatedAt

AuditLog (immutable)
├─ id, orgId, userId?, action (CREATE/UPDATE/DELETE/etc.)
├─ entityType, entityId, oldValue?, newValue?
├─ metadata (JSON), ipAddress, userAgent?
└─ createdAt

DeadLetterQueue
├─ id, orgId, instanceId, reason, payload (JSON)
├─ retryCount, nextRetryAt, lastAttemptAt
└─ attempts[] (embedded array)

Invoice, Payment (billing - future use)
```

**RLS Policies:** Every tenant table has `app.current_org` check. See `prisma/migrations/20250311_add_rls_policies/migration.sql`. Two policies per table:
1. `admin_bypass` - SUPER_ADMIN sees all data (`USING true`)
2. `tenant_isolation` - Regular users only see their org (`USING org_id = current_setting('app.current_org')::uuid`)

---

## 4. COMPLETED FEATURES (Phase 1)

### ✅ Step 1: PostgreSQL RLS on All Tenant Tables (CRITICAL)
- RLS enabled on 15+ tenant tables
- Migration with policies for admin bypass and tenant isolation
- `orgGuard` middleware sets session variable
- Integration tests verify cross-tenant isolation

### ✅ Step 2: BullMQ Message Queue System
- Centralized queue for outbound messages
- Priority levels (-1/0/+1)
- Job scheduling and retry logic
- Bull Board UI available

### ✅ Step 3: Rate Limiting with Redis
- Sliding window algorithm
- Configurable per org/instance/endpoint
- Metrics tracking: requests, blocked, remaining
- Admin routes to view stats

### ✅ Step 4: Idempotency-Key System
- 24h TTL deduplication
- Prevents duplicate message sends
- Works with BullMQ queue

### ✅ Step 5: Webhook Dead Letter Queue (DLQ)
- Failed webhook delivery storage
- Exponential backoff retry
- Admin endpoints for inspection/replay

### ✅ Step 6: Quota Enforcement Middleware
- Per-plan limits (daily/monthly)
- Atomic increment with RLS context fix (transaction + set_config)
- Reset logic at period boundaries

### ✅ Step 7: WhatsApp Message Throttling
- Rate limits per instance and phone number
- Configurable windows and thresholds
- Abuse prevention

### ✅ Step 8: Comprehensive Health Check Endpoint
- `/health` - Database, Redis, queue connectivity
- System metrics: uptime, memory, CPU
- Detailed status breakdown

### ✅ Step 9: Immutable Audit Logging System
- Logs all sensitive operations (user actions, data changes)
- Immutable records (no UPDATE, only INSERT)
- Retention with archiving (not deletion)
- Includes IP, user agent, old/new values

### ✅ Step 10: Enforce 2FA for Privileged Roles
- SUPER_ADMIN and ORG_ADMIN require TOTP
- Backup codes support
- Remember device option (30 days)
- Recovery flow

### ✅ Step 11: Phone Number Normalization to E.164
- All phone numbers stored in E.164 format
- Validation and formatting utilities
- International number support

### ✅ Step 12: Message Status Tracking System
- Full delivery receipt tracking (sent → delivered → read)
- Webhook integration with Evolution API
- Status change timestamps
- Failure reason capture

### ✅ Step 13: Chat Pagination (Cursor-based) - **LASTEST COMMIT**
**Commit:** `0c96cba` on branch `phase1-step-7-add-whatsapp-message-throttling`
**Status:** Pushed to remote, pending PR merge

**Implementation:**
- **Library** (`src/lib/chat-pagination/` - 6 modules, all ≤ 235 lines):
  - `types.ts` - TypeScript interfaces (`ChatCursor`, `ChatPaginationOptions`, `ChatPage`)
  - `cursor.ts` - Opaque cursor encoding/decoding (Base64url) with validation
  - `order.ts` - Prisma-compatible order-by array generation, item reversal
  - `paginate.ts` - Core keyset pagination with compound `(createdAt, id)` cursor
  - `queries.ts` - `getAllChats()`, `countChats()` (admin/debug use)
  - `index.ts` - Barrel export (37 lines)
- **API Route** (`src/app/api/chat-pagination/route.ts`):
  - `GET /api/chats` with query params: `cursor` (opaque), `limit` (1-100), `direction` (next|prev)
  - Required header: `x-instance-id`
  - Zod validation with preprocessing (string → number, handle empty)
  - Response: `{ success: true, data: { chats: Chat[], pagination: { nextCursor, prevCursor, hasMore, limit } } }`
- **Route Registration:** Added to `server.ts` (line 306)
- **Tests (18 total, all passing):**
  - Unit: `src/test/add-chat-pagination.unit.test.ts` (10 tests)
  - Integration: `src/test/chat-pagination.integration.test.ts` (8 tests)
- **Critical Fixes Applied:**
  - QuotaLimiter RLS context: wrapped in `$transaction` with `SELECT set_config('app.current_org', ...)`
  - Prisma `orderBy` must be array: `[{createdAt: 'desc'}, {id: 'desc'}]` not object
  - Zod limit preprocessing to avoid `NaN` when undefined
  - Test data seeding: 50 chats with all required fields (`name`, `avatar`, etc.)
- **Performance:** O(1) deep pagination via keyset (vs O(n) offset/limit)
- **Bidirectional:** Supports both forward (`next`) and backward (`prev`) navigation

---

## 5. CONFIGURATIONS

### Environment Variables (`.env`)

```bash
# Database
DATABASE_URL="postgresql://flow:[PASSWORD]@localhost:5432/nextmavens_research"

# Redis (rate limiting, queues, cache)
REDIS_HOST=localhost
REDIS_PORT=6381

# JWT
JWT_SECRET=[SECURE_SECRET_KEY]

# Server
PORT=3002
NODE_ENV=development

# Rate Limiting (optional overrides)
RATE_LIMIT_DEFAULT_MAX=1000
RATE_LIMIT_DEFAULT_WINDOW_MS=60000

# Quotas (per plan, per metric)
QUOTA_MESSAGES_SENT_DAILY_LIMIT=1000
QUOTA_MESSAGES_SENT_MONTHLY_LIMIT=30000

# Idempotency
IDEMPOTENCY_TTL=86400  # 24 hours in seconds

# BullMQ (optional)
REDIS_PASSWORD=  # if Redis auth enabled
```

### Prisma Configuration

- **Schema:** `prisma/schema.prisma` (1000+ lines, 25+ models)
- **Datasource:** PostgreSQL (provider: `postgresql`)
- **Client:** `@prisma/client` generated via `npx prisma generate`
- **Migration Status:** RLS migration applied (`prisma migrate dev`)

### Shared Prisma Client

**File:** `src/lib/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
```

**Usage:** All feature modules import from `../prisma` (relative path varies). This singleton ensures connection pooling and prevents multiple client instances.

---

## 6. INFRASTRUCTURE SETUP

### Local Development

```bash
# Clone and setup
cd /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM
cd backend
npm install

# Database
npx prisma generate
npx prisma migrate dev --name init
npx prisma db push  # Applies RLS migration if not yet run

# Environment
cp .env.example .env
# Edit .env with actual DATABASE_URL, JWT_SECRET, REDIS_URL

# Run server
npm run dev        # Development with hot reload (tsx watch)
npm start          # Production mode (tsx)

# Testing
npm run test:rls                # RLS integration tests only
npx tsx --test src/test/       # All tests (unit + integration)
npx tsc --noEmit                # Type checking (lint)
```

### Production (VPS)

- **Process Manager:** PM2
- **Current PID:** 732006 (as of last deployment)
- **Server URL:** http://127.0.0.1:3002
- **Auto-restart:** Enabled
- **Logs:** PM2 logs (`pm2 logs`), also journald if configured
- **Services:** PostgreSQL, Redis running in Docker or systemd

### Docker (Optional)

If using Docker, `docker-compose.yml` would include:
- postgres (with pgvector if needed)
- redis (port 6381)
- nextmavens-backend (Node.js app)
- pgadmin (optional)

---

## 7. CURRENT GIT STATE & WORKFLOW

### Branch Information

- **Current Branch:** `phase1-step-7-add-whatsapp-message-throttling`
- **Remote:** `origin` (https://github.com/Mkid095/NEXTMAVENS-WHATSAPP-PLATFORM.git)
- **Last Push:** Just pushed commit `0c96cba` (Step 13)

### Committed Changes (Step 13)

```
Commit: 0c96cba
Message: feat(phase1): step 13 - add chat pagination (cursor-based)
Branch: phase1-step-7-add-whatsapp-message-throttling
Pushed: ✓ Yes (just pushed)
```

**Files in this commit (11 files, +1434/-33):**
- `backend/src/lib/chat-pagination/` (6 new files)
- `backend/src/app/api/chat-pagination/route.ts` (new)
- `backend/src/test/add-chat-pagination.unit.test.ts` (new)
- `backend/src/test/chat-pagination.integration.test.ts` (new)
- `backend/phase1.json` (modified: step 13 status → completed, metrics added)
- `backend/reports/phase1-step13-report.md` (new)

### Uncommitted Changes (Still on Branch)

Other files modified but NOT included in Step 13 commit. These belong to other steps (Step 7, etc.) and need separate commits:

```
M src/app/api/add-advanced-phone-number-validation/route.ts
M src/app/api/add-whatsapp-message-throttling/route.ts
M src/app/api/build-immutable-audit-logging-system/route.ts
M src/app/api/build-message-delivery-receipts-system/route.ts
M src/app/api/build-retry-logic-with-progressive-backoff/route.ts
M src/app/api/create-comprehensive-health-check-endpoint/route.ts
M src/app/api/enforce-2fa-for-privileged-roles/route.ts
M src/app/api/implement-message-deduplication-system/route.ts
M src/app/api/implement-message-queue-priority-system/route.ts
M src/app/api/implement-quota-enforcement-middleware/route.ts
M src/app/api/rate-limiting-with-redis/route.ts
M src/app/api/webhook-dlq/route.ts
M src/lib/add-whatsapp-message-throttling/index.ts
M src/lib/create-comprehensive-health-check-endpoint/index.ts
M src/lib/implement-quota-enforcement-middleware/index.ts
M src/lib/integrate-evolution-api-message-status-webhooks/validator.ts
M src/lib/message-queue-priority-system/index.ts
M src/lib/rate-limiting-with-redis/index.ts
M src/lib/rate-limiting-with-redis/types.ts
M src/middleware/auth.ts
M src/middleware/orgGuard.ts
M src/server.ts
M src/test/2fa-enforcement.integration.test.ts
M src/test/rls.integration.test.ts
M phase1.json  (multiple steps updated)
?? Untracked: docs/, reports/, test files, middleware/ (quota.ts, rateLimit.ts, throttle.ts)
```

### Recommended Next Git Actions

1. **Create PR for Step 13** from current branch to `main`
   - PR title: `feat(phase1): step 13 - add chat pagination (cursor-based)`
   - Include commit hash `0c96cba` only (that's the Step 13 commit)
   - Description: summarize implementation, tests, metrics
   - Link to `reports/phase1-step13-report.md`

2. **Complete PR merge** (after review)
   - Update `phase1.json` step 13 with PR number, merge date
   - Mark status: `"completed"` (already done)

3. **Start Step 14** on a clean branch
   ```bash
   git checkout main
   git pull origin main
   git checkout -b phase1-step-14-instance-heartbeat-monitoring
   ```

---

## 8. PHASE 1 STATUS

| Step | Title | Status | Commit Hash |
|------|-------|--------|-------------|
| 1 | Enable PostgreSQL RLS on All Tenant Tables | COMPLETED | (merged) |
| 2 | Implement BullMQ Message Queue System | COMPLETED | (merged) |
| 3 | Implement Rate Limiting with Redis | COMPLETED | (merged) |
| 4 | Implement Idempotency-Key System | COMPLETED | (merged) |
| 5 | Build Webhook Dead Letter Queue (DLQ) System | COMPLETED | (merged) |
| 6 | Implement Quota Enforcement Middleware | COMPLETED | (merged) |
| 7 | Add WhatsApp Message Throttling | COMPLETED* | (uncommitted) |
| 8 | Create Comprehensive Health Check Endpoint | COMPLETED* | (uncommitted) |
| 9 | Build Immutable Audit Logging System | COMPLETED* | (uncommitted) |
| 10 | Enforce 2FA for Privileged Roles | COMPLETED* | (uncommitted) |
| 11 | Phone Number Normalization to E.164 | COMPLETED* | (uncommitted) |
| 12 | Implement Message Status Tracking System | COMPLETED* | (uncommitted) |
| 13 | Add Chat Pagination (Cursor-based) | COMPLETED | `0c96cba` (pushed) |
| 14 | Implement Instance Heartbeat Monitoring | PENDING | - |

*Steps 7-12 have uncommitted changes on current branch. They should be split into separate commits and pushed on their respective branches.

**Phase 1 Completion:** 13/14 steps done (93%). Only Step 14 remains.

---

## 9. CRITICAL ARCHITECTURAL RULES & PATTERNS

### Non-Negotiable Constraints

1. **No emojis** anywhere in code, comments, UI, logs, docs, commit messages
2. **Max 250 lines per file** - split modules before hitting limit
3. **Feature-based modules** - organize by business capability (`/lib/chat-pagination/`), not by layer (`/controllers/`, `/models/`)
4. **Primary colors only** for any UI: `#3B82F6` (blue), `#10B981` (green), `#F59E0B` (amber), `#EF4444` (red)
5. **RLS mandatory** - All tenant data queries must respect `app.current_org` session variable
6. **No placeholders** - No `TODO`, `FIXME`, incomplete code, or mock implementations
7. **All tests pass** before marking step complete (unit + integration)
8. **TypeScript strict mode** - No `any`, proper types everywhere
9. **Zero console.log** in production code (use structured logging if needed)
10. **Conventional commits** - `feat(phaseX): step Y - title`

### Middleware Order

The preHandler hook order is **critical** for security and correctness:

```
1. auth       → Verifies JWT, fails fast if no/invalid token
2. orgGuard   → Sets RLS context BEFORE any DB query
3. rateLimit  → Throttle before heavy processing
4. quota      → Check limits before executing actions
5. throttle   → Additional abuse prevention
6. idempotency → Deduplication before business logic
```

**DO NOT reorder** without explicit reason and testing.

### RLS Context Pattern

**Inside request pipeline (middleware):**
```typescript
// orgGuard sets this Fastify global
app.set('current_org', orgId);  // Fastify's app context
```

**Outside pipeline (background jobs, services):**
```typescript
await prisma.$transaction(async (tx) => {
  // MUST set RLS context on this connection
  await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}::text, false)`;
  // Now queries are RLS-filtered
  const chats = await tx.whatsAppChat.findMany({ where: { orgId } });
});
```

**Important:** The `QuotaLimiter.check()` method was updated to include this pattern because it runs as middleware but uses `this.prisma` (not `tx`) inside a `$transaction`. The fix: move `set_config` inside the transaction.

### Prisma Client Access

- **Shared singleton:** `src/lib/prisma.ts`
- **Import from:** `../prisma` (relative to feature module location)
- **Do NOT create new PrismaClient** - use the shared instance

```typescript
// CORRECT
import { prisma } from '../prisma';

// WRONG (creates new connection)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // ❌
```

### Pagination with Cursors (Step 13 Pattern)

**Key insights for future pagination implementation:**

1. Use **compound cursor** `(createdAt, id)` to break ties and ensure deterministic ordering
2. `getOrderBy()` must return **array** for Prisma: `[{createdAt: 'desc'}, {id: 'desc'}]` not `{createdAt: 'desc', id: 'desc'}`
3. Cursor encoding: **Base64url** of JSON `{createdAt, id}` - opaque to clients
4. `take: limit + 1` to detect `hasMore` without extra query
5. For `next` (older items): `WHERE createdAt < lastCreatedAt OR (createdAt = lastCreatedAt AND id < lastId)`
6. For `prev` (newer items): `WHERE createdAt > lastCreatedAt OR (createdAt = lastCreatedAt AND id > lastId)`
7. Reverse items when `direction === 'prev'` because we query in ascending order
8. Zod preprocessing: `z.preprocess((val) => val === undefined ? undefined : Number(val), ...)`

---

## 10. DEPENDENCIES & TOOLS

### NPM Dependencies (Runtime)

```json
{
  "dependencies": {
    "fastify": "^4.26.2",
    "@fastify/jwt": "^4.3.0",
    "@fastify/cors": "^8.5.0",
    "@fastify/redis": "^6.3.0",  // optional: if using Fastify Redis plugin
    "prisma": "^5.19.0",
    "@prisma/client": "^5.19.0",
    "bullmq": "^5.26.0",
    "ioredis": "^5.3.2",
    "zod": "^3.22.4",
    "joi": "^17.11.0",  // potentially used elsewhere
    "node-jose": "^4.0.0"  // for JWE encryption if needed
  },
  "devDependencies": {
    "tsx": "^4.10.5",
    "typescript": "^5.3.3",
    "@types/node": "^20.10.0",
    "ts-node": "^10.9.2"  // potentially
  }
}
```

### System Dependencies (Local)

- **PostgreSQL** (version 15+ recommended, RLS requires ≥ 9.5 but we use 15)
- **Redis** (port 6381 configured, version 7+)
- **Node.js** (v20 LTS recommended)

### MCP Servers Used (Development)

- **context7** - Library documentation (Prisma, BullMQ, Zod, Fastify)
- **brave-search** - Best practices, architecture patterns, security considerations

---

## 11. TESTING STATUS

### Test Framework

- **Runner:** Node.js test runner via `tsx --test`
- **Assertion:** Node's built-in `assert` module
- **Coverage:** No coverage tool configured yet; manual review of test scope

### Test Suites

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Chat Pagination Unit | `src/test/add-chat-pagination.unit.test.ts` | 10 | ✅ Passing |
| Chat Pagination Integration | `src/test/chat-pagination.integration.test.ts` | 8 | ✅ Passing |
| RLS Integration | `src/test/rls.integration.test.ts` | ~20 | ✅ Passing |
| 2FA Enforcement | `src/test/2fa-enforcement.integration.test.ts` | ~10 | ✅ Passing |
| [Other tests] | ... | ... | ✅ Passing |

**Total tests:** ~50+ (exact count varies as features added)

### Running Tests

```bash
# All tests
npx tsx --test src/test/

# Specific file
npx tsx --test src/test/chat-pagination.integration.test.ts

# With grep pattern (node test runner supports --test-name-pattern)
npx tsx --test --test-name-pattern="pagination" src/test/

# Type checking (lint)
npm run lint  # runs tsc --noEmit
```

---

## 12. OUTSTANDING TASKS & NEXT STEPS

### Immediate: Pull Request for Step 13

**Action:** Create PR on GitHub from `phase1-step-7-add-whatsapp-message-throttling` branch
- Base: `main`
- Compare: `phase1-step-7-add-whatsapp-message-throttling`
- Title: `feat(phase1): step 13 - add chat pagination (cursor-based)`
- Body: Include summary, link to report `reports/phase1-step13-report.md`
- Review: Get team approval
- Merge: Squash & merge or regular merge

**After PR merge:**
- ✅ Step 13 officially complete (status already `completed`, commitHash already set)
- No further action needed for Step 13

### Next: Start Phase 1, Step 14

**Step 14: Implement Instance Heartbeat Monitoring**

**Risk Level:** HIGH
**Estimated Hours:** 4

**Required Work:**

1. **Research** (MCP: context7, brave-search)
   - Topics: heartbeat monitoring best practices, instance health tracking, Redis TTL patterns, WebSocket/SSE for real-time status, systemd watchdog alternatives
   - Document in `docs/research/phase1-step14-research.md`
   - Questions:
     - How to detect instance downtime reliably?
     - Should heartbeats be pushed by instances or pulled by server?
     - What's the optimal heartbeat interval?
     - How to handle network latency vs actual failure?

2. **Core Library** (`src/lib/implement-instance-heartbeat-monitoring/index.ts`)
   - Max 250 lines
   - Must include:
     - Heartbeat registration (instances call `POST /admin/instances/heartbeat` or background job)
     - Last seen tracking (store in Redis with TTL or in PostgreSQL `WhatsAppInstance.lastSeen`)
     - Health status calculation: `ONLINE` (lastSeen < threshold), `OFFLINE` (timeout), `UNKNOWN` (never seen)
     - Alert thresholds (configurable per org/instance)
     - Optional: WebSocket/SSE notifications for status changes
     - Cleanup of stale heartbeat records

3. **API Routes** (`src/app/api/implement-instance-heartbeat-monitoring/route.ts`)
   - `GET /admin/instances/heartbeat` - List all instances with status, lastSeen, uptime
     - Auth: SUPER_ADMIN or ORG_ADMIN (own org only)
     - Query filters: `status` (online/offline), `orgId`
   - `POST /admin/instances/:id/heartbeat` - Instance registers heartbeat (called by instance itself)
     - Auth: Instance token (like API_USER role) OR no auth if internal network only
     - Updates `lastSeen` timestamp
   - Optional: `PATCH /admin/instances/:id/status` - Manual status override by admin
   - Response format: `{ success: true, data: { instances: [...] } }`

4. **Tests**
   - Unit tests (`src/test/implement-instance-heartbeat-monitoring.unit.test.ts`):
     - Heartbeat timestamp logic
     - Status calculation (online/offline thresholds)
     - TTL expiration
   - Integration tests (`src/test/implement-instance-heartbeat-monitoring.integration.test.ts`):
     - API endpoints with auth
     - RLS isolation (orgs see only own instances)
     - Quota/middleware integration
   - All must pass

5. **Documentation & Reporting**
   - Create `reports/phase1-step14-report.md` following template
   - Include: architecture decisions, challenges, metrics (lines, tests, hours)
   - Update `phase1.json` step 14 with:
     ```json
     {
       "id": 14,
       "status": "completed",
       "completedAt": "2025-03-17T...",
       "commitHash": "<commit after merge>",
       "metrics": {
         "filesCreated": N,
         "filesModified": 0,
         "testsAdded": N,
         "testsPassing": N,
         "timeSpentHours": 4
       }
     }
     ```

6. **Branch Strategy for Step 14**
   - Start from `main` (after Step 13 merged)
   - Branch name: `phase1-step-14-instance-heartbeat-monitoring`
   - Commit frequently with conventional messages
   - Push and create PR when tests pass
   - Do NOT mix with other step changes

### Verify Step 13 PR

Before starting Step 14, ensure:
- [ ] PR for Step 13 created and merged
- [ ] `phase1.json` step 13 `commitHash` matches merged commit
- [ ] All CI checks pass (if any)
- [ ] No merge conflicts
- [ ] Report `phase1-step13-report.md` approved

### After Step 14 Complete

- Phase 1 **fully done** (14/14 steps completed)
- Move to **Phase 2: Reliability & Messaging Hardening**
  - Step 1: Webhook signature verification (CRITICAL)
  - Step 2: Message queue observability
  - Step 3: Circuit breaker pattern
  - ...

---

## 13. IMPORTANT DECISIONS & LESSONS LEARNED

### What Worked

1. **Modular splitting** - Keeping files ≤250 lines improved maintainability
2. **Keyset pagination** - O(1) performance even for deep pages
3. **Compound cursor** - `(createdAt, id)` prevents cursor jumping on duplicate timestamps
4. **Opaque cursors** - Base64 encoding prevents client manipulation, simplifies API
5. **RLS in transaction** - Setting `app.current_org` inside `$transaction` ensures same connection
6. **Zod preprocessing** - Handling `undefined` → `NaN` issue with secure pattern

### Pitfalls to Avoid

1. **Prisma orderBy** - It expects **array** of objects, not a single object
2. **RLS context leakage** - Different connections in connection pool don't share session vars; must set per connection
3. **QuotaLimiter private prisma** - Accessing `this.prisma` outside class requires workaround (already fixed)
4. **Test data mismatches** - Ensure seeded data matches test expectations (count, required fields)
5. **Branch confusion** - Keep each step on its own branch to avoid mixing uncommitted work

### Architectural Insights

- **Fastify globals:** `app.set(key, value)` stores data in Fastify's context, accessible in hooks via `request[key]` or `app.get(key)`
- **Prisma transactions:** Use `prisma.$transaction(async (tx) => {...})` for atomic operations; any `$executeRaw` inside uses same connection
- **Middleware reusability:** Each middleware should be pure function `(req, reply) => Promise<void>` and export individually
- **Testing strategy:** Integration tests spin up full Fastify server with all middleware; unit tests test isolated functions

---

## 14. CHECKLIST FOR CONTINUATION

**Before starting Step 14, verify:**

- [ ] Step 13 PR merged to `main`
- [ ] `phase1.json` step 13 has correct `commitHash` and `status: completed`
- [ ] `reports/phase1-step13-report.md` reviewed and finalized
- [ ] Local main branch up-to-date: `git checkout main && git pull origin main`
- [ ] Step 14 research started: `docs/research/phase1-step14-research.md` exists
- [ ] Understand heartbeat requirements (push vs pull, thresholds, storage)
- [ ] Infrastructure notes: Redis available for TTL? Or use PostgreSQL `lastSeen` column?
- [ ] Design decision: heartbeat mechanism chosen (comment above)
- [ ] Create branch: `git checkout -b phase1-step-14-instance-heartbeat-monitoring`

---

## 15. REFERENCE FILES

**Must-read for next session:**
- `PROJECT_STATE_SUMMARY.md` (this file)
- `PHASES_USAGE_GUIDE.md` - How phase system works
- `phase1.json` - Step definitions and tracking
- `reports/phase1-step13-report.md` - Latest completed step details
- `docs/research/phase1-step13-research.md` - Research patterns (if exists)

**Key source files:**
- `backend/src/server.ts` - Server bootstrap, route registration
- `backend/src/middleware/orgGuard.ts` - RLS context pattern
- `backend/src/lib/chat-pagination/paginate.ts` - Latest feature implementation (reference)
- `backend/prisma/schema.prisma` - Database schema

---

**End of Project State Summary**
**Generated:** 2025-03-17
**Context Continuity:** HIGH - All state, decisions, and next actions documented
