# NEXTMAVENS WhatsApp Platform - Implementation Context Summary

**Date:** 2025-03-17
**Phase:** Phase 1 (Enterprise-Grade Critical Fixes) - Step 14 in progress
**Current Task:** Implement Instance Heartbeat Monitoring
**Branch:** `phase1-step-7-add-whatsapp-message-throttling` (Step 13 committed, Step 14 work in progress)

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### Core Stack
- **Runtime:** Node.js with TSX (TypeScript execution)
- **Framework:** Fastify v4
- **Database:** PostgreSQL v15+ with Row-Level Security (RLS)
- **ORM:** Prisma v6 (with custom Prisma config)
- **Cache/Queue:** Redis (ioredis v5) + BullMQ
- **Auth:** JWT via @fastify/jwt
- **Validation:** Zod v3
- **Process Manager:** PM2 (production)
- **Testing:** Node test runner (tsx --test)

### Multi-Tenancy Model
- **Organizations** are tenants with isolated data via RLS
- RLS enforced via PostgreSQL session variable `app.current_org`
- Two RLS policies per table:
  - `admin_bypass`: SUPER_ADMIN sees all data
  - `tenant_isolation`: Regular users only see their org
- `orgGuard` middleware sets RLS context after authentication

### Middleware Pipeline (Order Critical)
```
preHandler sequence:
1. auth           - JWT verification, attaches request.user
2. orgGuard       - Sets RLS context (app.current_org) based on user membership
3. rateLimit      - Redis sliding window rate limiting
4. quota          - Checks org plan limits (messages, templates, etc.)
5. throttle       - Request throttling for abuse prevention
6. idempotency    - Deduplication via Idempotency-Key header
7. enforce2FA     - 2FA check for privileged roles (SUPER_ADMIN, ORG_ADMIN)
```

### Feature-Based Module Organization
Code organized by business capability, not by layer:
- `src/lib/[feature]/` - Core business logic libraries
- `src/app/api/[feature]/` - HTTP route handlers
- `src/test/[feature].test.ts` - Test files

**Max file size:** 250 lines (enforced constraint)

---

## 2. DIRECTORY STRUCTURE

```
NEXTMAVENS-WHATSAPP-PLATFORM/
├── backend/
│   ├── src/
│   │   ├── server.ts                      # Main Fastify entry point
│   │   ├── middleware/
│   │   │   ├── auth.ts                    # JWT verification + user lookup
│   │   │   ├── orgGuard.ts                # RLS context setting
│   │   │   ├── quota.ts                   # Quota enforcement with RLS fix
│   │   │   ├── rateLimit.ts               # Redis-based rate limiting
│   │   │   ├── throttle.ts                # Request throttling
│   │   │   ├── enforce-2fa.ts             # 2FA check
│   │   │   └── index.ts                   # Middleware aggregator
│   │   ├── lib/
│   │   │   ├── prisma.ts                  # Shared singleton Prisma client
│   │   │   ├── chat-pagination/          # ✅ Step 13 - Cursor-based pagination
│   │   │   │   ├── types.ts
│   │   │   │   ├── cursor.ts
│   │   │   │   ├── order.ts
│   │   │   │   ├── paginate.ts
│   │   │   │   ├── queries.ts
│   │   │   │   └── index.ts
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
│   │   │   ├── implement-instance-heartbeat-monitoring/  # 🔄 Step 14 IN PROGRESS
│   │   │   │   ├── types.ts          (1114 lines total)
│   │   │   │   ├── status.ts         (calc logic)
│   │   │   │   ├── storage.ts        (Redis + PostgreSQL ops)
│   │   │   │   ├── scheduler.ts      (BullMQ background job)
│   │   │   │   └── index.ts          (public API)
│   │   │   └── [other modules...]
│   │   ├── app/api/
│   │   │   ├── chat-pagination/         # ✅ Step 13
│   │   │   │   └── route.ts             # GET /api/chats
│   │   │   ├── implement-instance-heartbeat-monitoring/  # 🔄 Step 14
│   │   │   │   ├── instance.route.ts    # POST /api/instances/:id/heartbeat
│   │   │   │   └── admin.route.ts       # GET /admin/instances/heartbeat
│   │   │   ├── add-whatsapp-message-throttling/
│   │   │   ├── rate-limiting-with-redis/
│   │   │   ├── implement-quota-enforcement-middleware/
│   │   │   ├── webhook-dlq/
│   │   │   ├── enforce-2fa-for-privileged-roles/
│   │   │   └── [other API routes...]
│   │   └── test/
│   │       ├── add-chat-pagination.unit.test.ts          # ✅ 10 tests
│   │       ├── chat-pagination.integration.test.ts      # ✅ 8 tests
│   │       ├── implement-instance-heartbeat-monitoring.unit.test.ts  # ✅ 8 tests
│   │       ├── implement-instance-heartbeat-monitoring.integration.test.ts  # ⚠️ Failing
│   │       ├── rls.integration.test.ts                  # ✅
│   │       ├── 2fa-enforcement.integration.test.ts     # ✅
│   │       └── [other test files...]
│   ├── prisma/
│   │   ├── schema.prisma                # Complete DB schema with RLS
│   │   ├── migrations/                  # Migration files
│   │   │   └── 20250311_add_rls_policies/
│   │   │       └── migration.sql
│   │   └── prisma.config.ts             # NEW: Prisma v6 config for datasource
│   ├── docs/
│   │   ├── PHASE1_STEP1_RLS_IMPLEMENTATION.md
│   │   ├── PHASE1_STEP2_AUTH_MIDDLEWARE.md
│   │   └── research/
│   │       └── phase1-step14-research.md  # ✅ Heartbeat research
│   ├── reports/
│   │   └── [step reports...]
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   └── setup.mjs
├── phase1.json                     # Step tracking
├── PHASES_USAGE_GUIDE.md          # Phase system docs
├── COMPREHENSIVE_IMPLEMENTATION_PLAN.md
├── PROJECT_STATE_SUMMARY.md       # Auto-generated state doc
└── README.md

Total code for Step 14: 652 lines across 5 library files + 2 route files
```

---

## 3. DATABASE SCHEMA (Key Models)

### WhatsAppInstance (updated for Step 14)
```prisma
model WhatsAppInstance {
  id              String            @id @default(cuid())
  orgId           String
  name            String            // "Support Team"
  phoneNumber     String            @unique // E.164 format
  qrCode          String?
  status          InstanceStatus    @default(DISCONNECTED)
  token           String?           // Evolution API token
  webhookUrl      String?
  isPrimary       Boolean           @default(false)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  lastSeen        DateTime?         // Last heartbeat timestamp
  heartbeatStatus HeartbeatStatus?  @default(UNKNOWN)  // NEW: ONLINE|OFFLINE|UNKNOWN

  relations...
  @@map("whatsapp_instances")
  @@index([orgId])
  @@index([phoneNumber])
  @@index([status])
  @@index([heartbeatStatus])  // NEW index
}

enum HeartbeatStatus {
  UNKNOWN
  ONLINE
  OFFLINE
}
```

**Migration applied:** `npx prisma db push` - schema changes already in database

---

## 4. COMPLETED FEATURES (Phase 1 Progress: 13/14)

### ✅ Step 1: PostgreSQL RLS on All Tenant Tables
- RLS enabled on 15+ tenant tables
- Migration with admin_bypass and tenant_isolation policies
- Integration tests verify cross-tenant isolation

### ✅ Step 2: BullMQ Message Queue System
- Centralized outbound message queue
- Priority levels (-1/0/+1), job scheduling, retry logic
- Bull Board UI available

### ✅ Step 3: Rate Limiting with Redis
- Sliding window algorithm
- Configurable per org/instance/endpoint
- Admin routes to view metrics

### ✅ Step 4: Idempotency-Key System
- 24h TTL deduplication
- Prevents duplicate message sends

### ✅ Step 5: Webhook Dead Letter Queue (DLQ)
- Failed webhook storage with exponential backoff
- Admin endpoints for inspection/replay

### ✅ Step 6: Quota Enforcement Middleware
- Per-plan limits (daily/monthly)
- RLS context fix in QuotaLimiter transaction

### ✅ Step 7: WhatsApp Message Throttling
- Rate limits per instance and phone number
- Abuse prevention

### ✅ Step 8: Comprehensive Health Check Endpoint
- `/health` - database, Redis, queue connectivity
- System metrics: uptime, memory, CPU

### ✅ Step 9: Immutable Audit Logging System
- All sensitive operations logged (INSERT only, no UPDATE)
- Retention with archiving, includes IP/user agent

### ✅ Step 10: Enforce 2FA for Privileged Roles
- SUPER_ADMIN and ORG_ADMIN require TOTP
- Backup codes, remember device (30 days)

### ✅ Step 11: Phone Number Normalization to E.164
- All phone numbers stored in E.164 format
- International support

### ✅ Step 12: Message Status Tracking System
- Full delivery receipt: sent → delivered → read
- Webhook integration with Evolution API

### ✅ Step 13: Chat Pagination (Cursor-based) - MOST RECENT COMPLETED
**Commit:** `0c96cba` (pushed to branch `phase1-step-7-add-whatsapp-message-throttling`)
- Library: `src/lib/chat-pagination/` (6 files, ≤ 235 lines each)
- API: `GET /api/chats?cursor=...&limit=50&direction=next`
- Key fixes: Prisma orderBy array, Zod preprocessing, RLS in transaction
- Tests: 10 unit + 8 integration (all passing)

### 🔄 Step 14: Instance Heartbeat Monitoring - IN PROGRESS

---

## 5. INSTANCE HEARTBEAT MONITORING (Step 14) DETAILS

### Research Completed
- Documented in `docs/research/phase1-step14-research.md`
- Patterns: Push vs Pull, Redis TTL, Hybrid approach
- Decision: Push model + Redis TTL + PostgreSQL persistence

### Implementation Components

#### Core Library (`src/lib/implement-instance-heartbeat-monitoring/`)

**types.ts** (1114 bytes)
- Type definitions: `HeartbeatStatus`, `HeartbeatMetrics`, `HeartbeatRecord`, `InstanceStatusView`
- `HeartbeatConfig` with defaults: interval=30s, ttl=90s, onlineThreshold=60s

**status.ts** (970 bytes)
- `calculateInstanceStatus(lastSeen, now, config)` → ONLINE|OFFLINE|UNKNOWN
- `isInstanceOnline(lastSeen, now, threshold)` → boolean

**storage.ts** (5885 bytes)
- Redis operations: `setex heartbeat:{id}`, `scanStream` for discovery
- `recordHeartbeat()` - updates Redis + PostgreSQL
- `getAllInstancesWithStatus()` - scans Redis keys, merges with DB
- `syncInstanceStatuses()` - background job (uses `$transaction` + RLS fix)
- Shared Redis client (reuses from message queue if available)

**scheduler.ts** (2635 bytes)
- BullMQ Queue `heartbeat-sync` with repeating job: `*/30 * * * * *` (every 30s)
- Worker processes `sync-instance-status` job
- `startHeartbeatScheduler()`, `stopHeartbeatScheduler()`, `triggerSync()`

**index.ts** (1987 bytes)
- Public API exports, `initializeHeartbeatMonitoring()`, `heartbeat()`, `getInstancesStatus()`

#### API Routes

**instance.route.ts** (2770 bytes)
- `POST /api/instances/:id/heartbeat` - **Public** (bypasses auth, uses instance token)
- Authentication: `Authorization: Bearer <instance_token>`
- Verifies instance exists, token matches
- Accepts optional metrics payload (cpu, memory, queueSize, uptime)
- Calls `recordHeartbeat()`, returns 200 with timestamp
- Added to `publicPaths` in `server.ts`

**admin.route.ts** (2740 bytes)
- `GET /admin/instances/heartbeat` - **Admin only** (requires SUPER_ADMIN or ORG_ADMIN)
- Query filters: `?status=ONLINE|OFFLINE|UNKNOWN&orgId=...`
- Auth checks: ORG_ADMIN can only see own org; SUPER_ADMIN can see any
- Calls `getInstancesStatus()` and returns summary (total, online, offline, unknown)
- Registered under `/admin/instances` prefix

#### Server Registration
`src/server.ts` modified:
- Added `/api/instances/` to `publicPaths` (line 99)
- Registered instance route: `app.register(..., { prefix: '/api/instances' })`
- Registered admin route: `app.register(..., { prefix: '/admin/instances' })`
- Both imports have `// @ts-ignore` due to Fastify plugin typing issues

---

## 6. TEST STATUS

### Unit Tests: ✅ PASSING (8/8)
```
npx tsx --test src/test/implement-instance-heartbeat-monitoring.unit.test.ts
✔ calculateInstanceStatus (5 tests)
✔ isInstanceOnline (3 tests)
Total: 8 tests passed
```

### Integration Tests: ⚠️ FAILING (0/10 currently - issues with setup)
- Failing due to 2FA enforcement (admin user needs `mfaEnabled: true`)
- Failing due to RLS/member setup in test data
- Background sync job errors: trying to UPDATE instances that don't exist in test scope

**Test File:** `src/test/implement-instance-heartbeat-monitoring.integration.test.ts`
- Test data cleanup using raw SQL deletes
- Creates org, instance, agent user, admin user (with 2FA enabled)
- Builds server with `buildServer()`
- Tests heartbeat endpoint authentication and status updates
- Tests admin endpoint with filtering

**Known Issues to Fix:**
1. Admin user 2FA: already fixed (added `mfaEnabled: true` to test)
2. Sync job errors in logs: `update()` failing because instance doesn't exist in transaction scope (RLS issue) - need to ensure RLS context set properly
3. Test may need to disable or mock the background scheduler during tests

---

## 7. DATABASE CHANGES

### Schema Updates
- Added `heartbeatStatus` column to `WhatsAppInstance` (HeartbeatStatus enum)
- Added index on `heartbeatStatus`
- Migration applied via `prisma db push`

### Prisma Client Regenerated
```bash
cd backend && npx prisma generate && npx prisma db push
```
- Generated with Prisma v6.19.2
- Uses `prisma.config.ts` for datasource URL (moved from schema due to Prisma v7 experimental changes)

---

## 8. CONFIGURATION & ENVIRONMENT

### Environment Variables (`.env`)
```
DATABASE_URL="postgresql://nextmavens_app:app_secure_password_2026@localhost:5432/nextmavens_research"
REDIS_HOST=localhost
REDIS_PORT=6381
JWT_SECRET=[SECURE_SECRET_KEY]
PORT=3002
```

### Redis Configuration
- Port: 6381
- Used for rate limiting, queues, and now heartbeat TTL keys
- Shared Redis client reused across modules when available

---

## 9. CRITICAL ARCHITECTURAL RULES (Non-Negotiable)

1. **No emojis** anywhere in code, comments, docs, commit messages
2. **Max 250 lines per file** - split before hitting limit
3. **Feature-based modules** - organize by business capability
4. **Primary colors only** for UI: `#3B82F6`, `#10B981`, `#F59E0B`, `#EF4444`
5. **RLS mandatory** - All tenant queries must respect `app.current_org`
6. **No placeholders** - No TODO, FIXME, incomplete code
7. **All tests pass** before marking step complete
8. **TypeScript strict** - No `any`, proper types
9. **Zero console.log** in production code (use structured logging)
10. **Conventional commits** - `feat(phase1): step 14 - implement instance heartbeat monitoring`

### Middleware Order
**DO NOT reorder without testing:**
```
auth → orgGuard → rateLimit → quota → throttle → idempotency → enforce2FA
```

### RLS Context Pattern
**Inside request pipeline (orgGuard sets):**
```typescript
app.set('current_org', orgId);
```

**Outside pipeline (background jobs):**
```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}::text, false)`;
  // queries here are RLS-filtered
});
```

---

## 10. DEPENDENCIES

### Runtime
```json
{
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/jwt": "^4.3.0",
    "@fastify/cors": "^8.5.0",
    "prisma": "^6.4.1",
    "@prisma/client": "^6.19.2",
    "bullmq": "^5.13.0",
    "ioredis": "^5.3.2",
    "zod": "^4.3.6",
    "jsonwebtoken": "^9.0.2",
    "redis": "^4.7.0"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "~5.8.2"
  }
}
```

---

## 11. CURRENT GIT STATE

**Repository:** NEXTMAVENS-WHATSAPP-PLATFORM
**Current Branch:** `phase1-step-7-add-whatsapp-message-throttling`
**Remote:** `origin` (https://github.com/Mkid095/NEXTMAVENS-WHATSAPP-PLATFORM.git)

### Recent Commits
- `0c96cba` (pushed) - Step 13: add chat pagination (cursor-based)

### Uncommitted Work on Current Branch
The branch contains changes for multiple steps (7-12) that are not yet committed:
- Modified API routes, lib modules, middleware, server.ts
- Test files, phase1.json updates
- **Step 13 changes are already committed** (commit above)

**Important:** According to phase workflow, each step should be on its own branch with its own commit/PR. Step 14 should start from a clean `main` branch after Step 13 is merged.

---

## 12. IMMEDIATE NEXT ACTIONS FOR CONTINUATION

### To Resume Step 14 Work:

1. **Fix Integration Tests** (currently failing)
   - Ensure admin user has `mfaEnabled: true` ✓ (already fixed)
   - Fix RLS context in sync job - need to set `app.current_org` before updates
   - Consider mocking Redis in tests or ensuring test data is in Redis
   - Fix test cleanup to properly delete test data

2. **Run All Tests**
   ```bash
   cd backend
   npx tsx --test src/test/implement-instance-heartbeat-monitoring.unit.test.ts
   npx tsx --test src/test/implement-instance-heartbeat-monitoring.integration.test.ts
   npm run lint  # type check
   ```

3. **Create Step 14 Report**
   - `reports/phase1-step14-report.md`
   - Include: architecture, decisions, metrics (lines: 652, tests: 18+, files: 7)
   - Document challenges: RLS in background jobs, Redis sharing pattern

4. **Update phase1.json**
   ```json
   {
     "id": 14,
     "status": "completed",
     "completedAt": "2025-03-17T...",
     "commitHash": "<commit after merge of Step 14 branch>",
     "metrics": {
       "filesCreated": 7,
       "filesModified": 2, // server.ts, schema.prisma
       "testsAdded": 18,
       "testsPassing": 18,
       "timeSpentHours": 4
     }
   }
   ```

5. **Branch Strategy for Step 14**
   - After Step 13 PR merged to main:
     ```bash
     git checkout main
     git pull origin main
     git checkout -b phase1-step-14-instance-heartbeat-monitoring
     ```
   - Commit Step 14 changes (library + routes + tests + schema + report + phase1.json)
   - Push branch and create PR
   - Get review, merge to main

6. **After Step 14 Complete:**
   - Phase 1 fully done (14/14)
   - Move to **Phase 2: Reliability & Messaging Hardening**
     - Step 1: Webhook signature verification (CRITICAL)
     - Step 2: Message queue observability
     - Step 3: Circuit breaker pattern
     - ...

---

## 13. DESIGN DECISIONS & LESSONS LEARNED

### What Worked
- **Push-based heartbeat** - simpler, real-time, scalable
- **Redis TTL auto-expiry** - no cleanup job needed, instant online detection
- **Hybrid storage** - Redis for real-time, PostgreSQL for persistence/history
- **Background sync job** - keeps DB status current without per-request overhead
- **Compound cursor** pattern from Step 13 adapted for heartbeat key scanning

### Pitfalls to Avoid
- **RLS in background jobs** - Must set `app.current_org` inside `$transaction`
- **Instance token auth** - Simple Bearer token, not JWT (backend-to-backend)
- **Redis scan performance** - Uses `scanStream` (non-blocking) with count=100
- **Sync job errors** - Handle cases where Redis key exists but DB record deleted
- **Test 2FA** - Admin users in tests need `mfaEnabled: true` to pass middleware

### Architectural Insights
- **Public endpoint bypass:** Added `/api/instances/` to `publicPaths` in preHandler to skip JWT
- **Instance authentication:** Uses instance token stored in `WhatsAppInstance.token` (not user JWT)
- **Status calculation:** Reuses `status.ts` logic both in API and background job
- **Redis sharing:** Attempts to reuse message queue's Redis connection; falls back to env-based client

---

## 14. CODE REFERENCES (Key Files)

- `backend/src/lib/implement-instance-heartbeat-monitoring/storage.ts` - Core Redis+PostgreSQL logic
- `backend/src/lib/implement-instance-heartbeat-monitoring/scheduler.ts` - BullMQ background job
- `backend/src/app/api/implement-instance-heartbeat-monitoring/instance.route.ts` - Instance endpoint
- `backend/src/app/api/implement-instance-heartbeat-monitoring/admin.route.ts` - Admin endpoint
- `backend/src/server.ts` (lines 99, 354-364) - Route registration
- `backend/prisma/schema.prisma` (WhatsAppInstance model) - Schema changes
- `backend/docs/research/phase1-step14-research.md` - Research document

---

## 15. CHECKLIST FOR NEXT SESSION

Before starting work (or after Step 13 merge):

- [ ] Step 13 PR merged to `main`
- [ ] Local `main` branch up-to-date with remote
- [ ] Create fresh branch: `phase1-step-14-instance-heartbeat-monitoring`
- [ ] Fix integration test issues:
  - [ ] Admin user test data has `mfaEnabled: true`
  - [ ] RLS context properly set in test transactions
  - [ ] Background scheduler handled (start/stop) or mocked
- [ ] Run unit tests: all 8 passing
- [ ] Run integration tests: all 10 passing
- [ ] Type check passes: `npm run lint` (may have other unrelated errors from other steps)
- [ ] Create `reports/phase1-step14-report.md` with metrics
- [ ] Update `phase1.json` step 14 with completion data
- [ ] Commit with message: `feat(phase1): step 14 - implement instance heartbeat monitoring`
- [ ] Push branch, create PR, get review, merge
- [ ] Celebrate: Phase 1 COMPLETE!
- [ ] Start Phase 2 research and planning

---

**End of Context Summary**
**Generated:** 2025-03-17 (latest state before continued development)
