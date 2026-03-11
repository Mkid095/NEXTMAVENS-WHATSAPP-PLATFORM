# NEXTMAVENS WhatsApp Evolution API Platform
## Comprehensive Implementation & Improvement Plan

**Date**: March 11, 2026
**Status**: ACTIVE DEVELOPMENT
**Version**: 2.0

---

## Executive Summary

This document outlines the comprehensive plan for enhancing the WhatsApp Evolution API Platform into a fully-featured, multi-tenant, reseller-capable SaaS platform with superior user experience, complete documentation, and production-ready infrastructure.

---

## Table of Contents

**Note**: Section numbering may have minor gaps/duplications due to incremental development. Use this TOC for navigation.

1. [Current System Status](#1-current-system-status)
2. [Multi-Tenancy & User Roles Architecture](#2-multi-tenancy--user-roles-architecture)
3. [Authentication & Security (Enterprise Hardening)](#3-authentication--security-enterprise-hardening)
4. [User Flow & Signup Journey](#4-user-flow--signup-journey)
5. [Instance Management & Multi-Sub-Instances](#5-instance-management--multi-sub-instances)
6. [Payment & Billing System (Phase 3+)](#6-payment--billing-system-phase-3)
7. [Documentation Strategy](#7-documentation-strategy)
8. [Role-Based Access Control (RBAC) Refinement](#8-role-based-access-control-rbac-refinement)
9. [Internal Chat Application Enhancement](#9-internal-chat-application-enhancement)
10. [API Documentation & Developer Experience](#10-api-documentation--developer-experience)
11. [Rate Limiting Implementation](#11-rate-limiting-implementation)
12. [Super Admin Monitoring Dashboard](#12-super-admin-monitoring-dashboard)
13. [SEO & Marketing Site](#13-seo--marketing-site)
14. [Enterprise-Grade Critical Fixes (Phase 1 Priority)](#14-enterprise-grade-critical-fixes-phase-1-priority)
15. [Testing Strategy (Enhanced)](#15-testing-strategy-enhanced)
16. [Monitoring & Observability (Phase 8+)](#16-monitoring--observability-phase-8)
17. [Implementation Phases (Updated)](#17-implementation-phases-updated)
18. [Database Schema Migrations (Critical)](#18-database-schema-migrations-critical)
19. [Deployment Checklist (Enterprise)](#19-deployment-checklist-enterprise)
20. [Product Roadmap (Beyond Phase 8)](#20-product-roadmap-beyond-phase-8)
21. [Success Metrics & KPIs](#21-success-metrics--kpis)
22. [Risk Mitigation (Enterprise-Grade)](#22-risk-mitigation-enterprise-grade)
23. [Required Resources](#23-required-resources)
24. [Immediate Next Steps](#24-immediate-next-steps)
25. [Appendix](#25-appendix)

---

## 1. Current System Status

### ✅ What We Have Now

**Frontend (React + TypeScript + Vite)**
- Complete dashboard with instance management
- Messaging interface with chat history
- Groups management (CRUD)
- Template management (CRUD, render)
- Agent/team management with queue routing
- Analytics dashboard
- Webhook management & delivery logs
- User authentication (JWT)
- Multi-tenant organization support
- Reseller sub-instance creation
- Integration guide component

**Backend (Fastify + PostgreSQL + Prisma)**
- Full REST API with authentication
- Multi-tenancy with RLS
- Instance management with Evolution API integration
- Webhook processing system
- Team collaboration models (agents, assignments, routing)
- Analytics tracking
- Database schema with all core models

**Infrastructure**
- Deployed at `https://whatsapp.nextmavens.cloud` (admin portal)
- API at `https://whatsappapi.nextmavens.cloud`
- Separate backend VPS at `/home/ken/next-mavens-vps/`
- PM2 process management
- PostgreSQL database with RLS

### ⚠️ Known Gaps & Issues (Priority Order)

**CRITICAL (Blocking Production)**
1. **RLS Policies Not Implemented**: Multi-tenancy relies on orgId checks in code only. Need PostgreSQL Row Level Security on ALL tenant tables as fail-safe.
2. **Rate Limiting Absent**: No Redis-based rate limiting. vulnerable to abuse and quota bypass.
3. **No Message Queue**: Messages sent synchronously to Evolution API. Will crash under load. Need BullMQ.
4. **Idempotency Missing**: Duplicate message sends on retry. Need Idempotency-Key support.
5. **Webhook Reliability**: No retry logic, dead letter queue, or signature verification.
6. **Quota Enforcement**: Server-side quota checks not implemented. Billing impossible.
7. **No Message Throttling**: WhatsApp requires per-instance rate protection (20 msg/sec).
8. **Missing Health Checks**: No comprehensive `/health` endpoint for monitoring.
9. **No Audit Logging**: Cannot track admin actions for SOC2 compliance.
10. **2FA Not Required**: SUPER_ADMIN and ORG_ADMIN lack mandatory 2FA.

**HIGH (Production Ready)**
11. **Phone Number Normalization**: No E.164 format conversion. Leads to duplicate contacts.
12. **Message Status Tracking**: No delivery status updates (sent → delivered → read).
13. **Chat Pagination**: Returns all messages. Will slow with history.
14. **Search Infrastructure**: No full-text search on messages. SQL LIKE too slow.
15. **Spam Protection**: No CAPTCHA on signup. Vulnerable to bots.
16. **Instance Heartbeat**: No proactive monitoring of disconnects.

**MEDIUM (User Experience)**
17. **Internal Notes**: Agent-private notes on chats not implemented.
18. **Chat Transfer**: No way to transfer conversations between agents.
19. **File Uploads**: Images only. Need documents, video, audio.
20. **Real-time Updates**: Polling only. Need WebSocket push.

**LOW (Missing Nice-to-Have)**
21. **Landing Page & SEO**: No public marketing site.
22. **Complete Documentation**: API docs partial, no SDKs.
23. **Payment Billing**: Not started.
24. **Super Admin Dashboard**: Only basic org list exists.
25. **Testing**: No unit/integration/E2E tests.

---

## 2. Multi-Tenancy & User Roles Architecture

### 2.1 Tenant Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                    SUPER ADMIN (Platform Owner)        │
│  • View all organizations & instances                   │
│  • Monitor server health & logs                         │
│  • Manage system-wide settings                          │
│  • View revenue & usage metrics                         │
│  • Manage all reseller accounts                         │
└─────────────────────────────────────────────────────────┘
                            │ controls
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  ORGANIZATION / COMPANY                │
│                    (Tenant Account)                    │
│  • Owned by ORG_ADMIN                                  │
│  • Has main WhatsApp instance                          │
│  • Has quota/limits based on plan                      │
│  • Can create sub-instances (if reseller enabled)     │
│  • Can manage team members                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   INSTANCE (WhatsApp)                  │
│  • Main instance: Connected to org                     │
│  • Sub-instances: For reseller customers              │
│  • Has independent QR code                             │
│  • Has separate quotas & webhooks                      │
│  • Isolated data per instance                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   TEAM MEMBERS                         │
│  • Agents (handle customer chats)                      │
│  • Managers (view analytics, manage agents)           │
│  • Viewers (read-only access)                          │
│  • API-only users (no UI access)                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Role Definitions & Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| SUPER_ADMIN | Platform owner | All operations across all tenants, server access, billing view |
| ORG_ADMIN | Company admin | Full org control: instances, team, settings, billing, sub-instances |
| MANAGER | Team lead | View analytics, manage agents, assign chats, view logs |
| AGENT | Support staff | Access chat app, send messages, view assigned chats only |
| VIEWER | Read-only | View dashboards, reports (no modifications) |
| API_USER | Technical integration | API access only, no UI, limited to assigned scopes |

**Implementation**: Extend Prisma `User.role` enum with these roles. Add `permissions` JSONB field for granular ACL if needed.

---

### 2.3 Enterprise-Grade Data Isolation (CRITICAL)

**Decision**: Implement **PostgreSQL Row Level Security (RLS)** on ALL tenant tables.

**Tables requiring RLS**:
```sql
-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_usages ENABLE ROW LEVEL SECURITY;
```

**RLS Policy Example**:
```sql
CREATE POLICY tenant_isolation_messages
ON whatsapp_messages
USING (org_id = current_setting('app.current_org')::uuid);
```

**Fastify Middleware** (applied to ALL authenticated routes):
```typescript
// Set PostgreSQL session variable for RLS
await prisma.$executeRaw`
  SET app.current_org = ${req.user.orgId}
`;
```

**Result**: Even if backend code has a bug and forgets to filter by orgId, RLS prevents cross-tenant data leakage.

---

### 2.4 Cross-Tenant Isolation Protection

**Decision**: Global middleware enforcement required.

**Three-Layer Defense**:
1. **Authentication**: Verify user is logged in (JWT)
2. **Org Membership**: Verify user belongs to requested org (via Member table)
3. **RLS**: Database-level enforcement (defense in depth)

**Never trust client-provided orgId**. Always derive from:
- `req.user.orgId` (primary org context)
- Or `req.user.memberships` array (if multi-org support added later)

**Example Middleware**:
```typescript
async function orgGuard(req, reply, orgIdParam?: string) {
  const user = req.user;

  // SUPER_ADMIN bypasses org checks
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  // Verify user is member of the org
  const member = await prisma.member.findFirst({
    where: {
      userId: user.id,
      orgId: orgIdParam || user.orgId
    }
  });

  if (!member) {
    throw new HTTPError(403, 'Access denied: not a member of this organization');
  }

  // Set RLS context
  await prisma.$executeRaw`
    SET app.current_org = ${member.orgId}
  `;

  return true;
}
```

---

### 2.5 Soft Delete & Data Retention Strategy

**Decision**: Mixed soft-delete and TTL cleanup.

| Entity | Strategy | Retention |
|--------|----------|-----------|
| Organization | Soft delete (`deletedAt`) | Permanent unless explicit purge |
| WhatsAppInstance | Soft delete (`deletedAt`) | Permanent unless explicit purge |
| WhatsAppMessage | Hard delete | 90 days (compliance + performance) |
| WhatsAppLog | Hard delete | 30 days |
| WebhookDeliveryLog | Hard delete | 30 days |
| AuditLog | Hard delete | 180 days (longer for compliance) |

**Implementation**:
- Soft delete: Set `deletedAt` timestamp. All queries filter `deletedAt = null`.
- Hard delete: Daily cron job (`0 2 * * *`) to purge old records.
- Database indexes on `deletedAt` for performance.

**Why**:
- Control database growth
- GDPR/CCPA compliance (right to be forgotten requires hard delete capability)
- Query performance (smaller tables)

---

### 2.6 Tenant Plan Limits Enforcement

**Decision**: Server-side quota enforcement in middleware. Never rely on UI.

**Quota Types**:
- **Rate limit**: Messages per 10 minutes (e.g., 1000 main, 300 sub)
- **Monthly cap**: Total messages per billing cycle (varies by plan)

**Enforcement Flow**:
```
Request → Auth → QuotaGuard Middleware → Route Handler
           ↓
     Check quota (Redis)
           ↓
     Allow / Deny (429)
```

**Middleware Example**:
```typescript
const quotaGuard = async (req, reply, next) => {
  const { instanceId } = req.params;
  const user = req.user;

  // SUPER_ADMIN bypasses quota
  if (user.role === 'SUPER_ADMIN') return next();

  // Fetch instance + org + quota
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    include: {
      org: {
        select: {
          plan,
          limits // JSON: { messages10Min: 1000, messagesMonthly: 10000 }
        }
      },
      quotaUsage: {
        where: {
          type: 'RATE_10MIN',
          periodStart: { gte: startOfWindow }
        }
      }
    }
  });

  // Check rate limit
  const rateUsed = instance.quotaUsage[0]?.used || 0;
  const rateLimit = instance.org.limits.messages10Min;

  if (rateUsed >= rateLimit) {
    return reply.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 600 // seconds
    });
  }

  // Increment rate counter (Redis INCR with expiry)
  await redis.incr(`rate:${instance.id}:${startOfWindow}`);
  next();
};
```

---

### 2.7 SUPER_ADMIN Bypass & Audit

**Decision**: SUPER_ADMIN can access ALL resources without org filtering, but **every access must be logged**.

**Implementation**:
```typescript
// In middleware:
if (user.role === 'SUPER_ADMIN') {
  // Log the access for compliance
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'SUPER_ADMIN_ACCESS',
      resource: `${req.method} ${req.url}`,
      metadata: {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }
    }
  });
  // Skip org filtering
  return next();
}
```

**Audit Log Model** (ensure exists):
```prisma
model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  action      String   // e.g., 'SUPER_ADMIN_ACCESS', 'INSTANCE_DELETE', 'QUOTA_CHANGE'
  resource    String   // e.g., 'whatsapp_instances', 'organizations'
  resourceId  String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

---

## 3. Authentication & Security (Enterprise Hardening)

### 3.1 Two-Factor Authentication (2FA) Policy

**Decision**: Mandatory for privileged roles, optional for others.

| Role | 2FA Required |
|------|--------------|
| SUPER_ADMIN | ✅ Required |
| ORG_ADMIN | ✅ Required |
| MANAGER | Optional |
| AGENT | Optional |
| VIEWER | Optional |
| API_USER | N/A (no UI) |

**Implementation**:
- **Method**: TOTP (Time-based One-Time Password)
- **Libraries**: `speakeasy` for generation/verification
- **Authenticator Apps**: Google Authenticator, Microsoft Authenticator, Authy
- **Avoid**: SMS (less secure, SIM swap attacks)

**User Flow**:
1. User enables 2FA in Settings → Security
2. System generates secret + QR code
3. User scans with authenticator app
4. User enters 6-digit code to verify
5. Recovery codes generated (10 codes, one-time use)
6. On next login, after password → prompt for TOTP code

**Database**: Add column `User.totpSecret` (encrypted). Store recovery codes in `User.twoFactorRecoveryCodes` (JSON array, hashed).

**Backup**: Allow recovery codes. If user loses codes → admin reset (requires support ticket).

---

### 3.2 Password Policy

**Decision**: Strong password requirements with breached password detection.

**Requirements**:
- Minimum length: **10 characters**
- At least **1 uppercase** letter
- At least **1 lowercase** letter
- At least **1 number**
- At least **1 symbol** (e.g., !@#$%^&*)
- **Not in breached password list** (HIBP API check)

**Implementation**:
- Frontend validation (user feedback)
- Backend validation (security)
- Password strength meter (zxcvbn library)

**Password Changes**:
- Require current password for change
- Invalidate all active sessions on password reset (security)
- Send email notification on password change

---

### 3.3 Authentication Rate Limiting

**Decision**: Aggressive rate limiting to prevent brute force attacks.

| Endpoint | Limit | Window | Per |
|----------|-------|--------|-----|
| POST /auth/login | 5 attempts | 15 minutes | IP |
| POST /auth/2fa/verify | 3 attempts | 1 hour | IP |
| POST /auth/register | 10 attempts | 24 hours | IP |
| POST /auth/forgot-password | 3 attempts | 1 hour | Email |
| POST /auth/reset-password | 5 attempts | 1 hour | Token |

**Implementation**: `rate-limiter-flexible` + Redis

```typescript
const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'ratelimit:auth:login',
  points: 5,
  duration: 900, // 15 min
  blockDuration: 1800 // block for 30 min after exhaustion
});
```

---

### 3.4 JWT Configuration

**Access Token**:
- **Expiry**: 15 minutes
- **Algorithm**: HS256 (HMAC with SHA-256)
- **Payload**: `{ userId, orgId, role, permissions[] }`
- **Storage**: Memory (not localStorage for XSS protection)

**Refresh Token**:
- **Expiry**: 30 days
- **Storage**: Database table `refresh_tokens` (hashed)
- **Rotation**: Yes, each refresh generates new refresh token (prevents replay)
- **Revocation**: Can revoke all tokens on password change or admin action

**Flow**:
```
Access Token Expires (15min)
    ↓
Client sends Refresh Token
    ↓
Verify refresh token in DB (not revoked, not expired)
    ↓
Issue new Access Token + new Refresh Token
    ↓
Return to client
```

**Security**:
- Set `HttpOnly` + `Secure` + `SameSite=Strict` cookies for tokens (if using cookies)
- Or use `Authorization: Bearer <token>` header with secure storage (React Native, mobile)
- Implement token blacklist for logout (store JTI in Redis with expiry)

---

### 3.5 Session Management

**Decision**: Full session visibility and control for users.

**Features**:
1. **Active Sessions Page** (`/settings/sessions`):
   - List all active sessions with IP, location, device, last seen
   - "Revoke" button per session
   - "Logout All Other Devices" button

2. **Session Model** (already exists: `Session`):
   - `tokenHash` (for lookup)
   - `refreshToken` (encrypted)
   - `userAgent`, `ipAddress`, `location`
   - `lastSeenAt`, `expiresAt`, `status`

3. ** LastSeen Update**:
   - On every API request, update `Session.lastSeenAt`
   - Use Redis cache to avoid DB overload

4. **Concurrent Session Limit**:
   - Optional: limit to 5 concurrent sessions per user
   - Enforced in auth middleware

---

### 3.6 Password Reset Flow

**Decision**: Secure, time-limited reset tokens.

**Flow**:
```
1. User clicks "Forgot Password"
2. Enter email
3. System generates:
   - Reset token (crypto.randomBytes(32).toString('hex'))
   - Expires in: 30 minutes
   - Store hash in DB: passwordResetTokens
4. Send email with link:
   https://app.example.com/reset-password?token=abc123
5. User clicks link → reset form
6. User enters new password (meets policy)
7. Verify token (hash compare, not expired)
8. Update password (hash with bcrypt/argon2)
9. Invalidate all sessions (security)
10. Send confirmation email
```

**Database Model**:
```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   // bcrypt hash of the token
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

**Security**:
- Ensure reset tokens **never exposed in logs** (redact from request logs)
- Token one-time use (mark `usedAt`)
- Rate limit reset requests per email

---

### 3.7 Input Validation & Sanitization

**Decision**: Use `Zod` for runtime validation on all API inputs.

**Example**:
```typescript
import { z } from 'zod';

const sendMessageSchema = z.object({
  number: z.string().regex(/^\d+@s\.whatsapp\.net$//, 'Invalid phone format'),
  text: z.string().min(1).max(4096),
  options: z.object({
    delay: z.number().int().positive().optional(),
    presence: z.enum(['available', 'unavailable', 'composing']).optional(),
    linkPreview: z.boolean().optional(),
  }).optional(),
});

// In route handler:
const validated = sendMessageSchema.parse(request.body);
```

**XSS Prevention**:
- Sanitize message text before storing/displaying (DOMPurify)
- Never render raw HTML from user input
- Set `Content-Security-Policy` headers (via Helmet)

---

### 3.8 Security Headers (Helmet)

**Decision**: Use `fastify-helmet` for standard security headers.

Headers:
- `Strict-Transport-Security`: HTTPS only
- `X-Content-Type-Options`: nosniff
- `X-Frame-Options`: DENY (prevent clickjacking)
- `X-XSS-Protection`: 1; mode=block
- `Content-Security-Policy`: restrictive default + allowed domains
- `Referrer-Policy`: strict-origin-when-cross-origin
- `Permissions-Policy`: limit browser features (geolocation, camera, etc.)

---

### 3.9 Audit Logging

**Decision**: Immutable audit trail for all sensitive operations.

**Events to Audit**:
- Login/logout (success + failure)
- Password changes
- 2FA enable/disable
- Org creation/deletion
- Instance creation/deletion
- Quota modifications
- Role changes (user promotion/demotion)
- Payment events (subscription created, canceled)
- SUPER_ADMIN access
- Data export/download

**Audit Log Model** (see Section 2.7)

**Implementation**:
- Central `auditService.log(action, resourceId, metadata)`
- Write-audit-first pattern (audit before action)
- Do not expose audit logs to regular users (only SUPER_ADMIN, ORG_ADMIN)
- Retain 180 days (compliance)

---

---

## 4. User Flow & Signup Journey

### 4.1 Platform Owner (Super Admin)
1. Initial setup via direct database seeding
2. Login at `/admin` (separate route)
3. Dashboard shows:
   - All organizations count & list
   - System health (CPU, RAM, disk)
   - API server status & logs
   - Revenue overview
   - Recent signups
4. Can CRUD organizations, assign quotas, view all data

### 3.2 New Customer (Company Admin)
```
Flow:
1. Visit landing page → "Get Started Free"
2. Register with email → Verification email (Resend)
3. Choose plan (Free / Basic / Pro / Enterprise)
4. Fill org details (company name, timezone, etc.)
5. First login redirected to ONBOARDING WIZARD:
   - Step 1: Create WhatsApp instance
   - Step 2: Scan QR with phone
   - Step 3: Connect & test
   - Step 4: Invite team members
   - Step 5: Configure webhooks & API keys
6. Dashboard with quick actions
```

### 3.3 Team Member Invitation
1. Org admin goes to `/settings/team`
2. Click "Invite Member" → Enter email, select role
3. System sends unique invitation link (expires in 7 days)
4. Recipient clicks link → sets password → joins org
5. Sees dashboard based on assigned role

### 3.4 Reseller Flow
```
Reseller Registration:
1. Contact platform owner OR apply via landing page
2. Platform owner marks org as "isReseller: true" in DB
3. Reseller gets special dashboard tab: "Sub-Instances"
4. Reseller can:
   - Create sub-instance for client
   - Assign quota (messages/month)
   - Generate API key for client
   - Monitor usage per sub-instance
   - Bill client independently
```

---

## 4. Instance Management & Multi-Sub-Instances

### 4.1 Instance Types

**Main Instance** (belongs to org directly)
- Created by org admin
- Full API & webhook access
- Counts against org's main quota
- Can have multiple team members assigned

**Sub-Instance** (created by reseller)
- Owned by reseller org but assigned to client
- Separate QR code
- Separate quota tracking
- Can be transferred to another org later
- Webhooks go to reseller's endpoint or client's

### 4.2 Quota System

**Quota Models**:
- **Messages Per 10 Minutes**: Rate limit for sending (1000 main, 300 sub)
- **Messages Per Month**: Total monthly cap (custom per plan)
- **Active Instances**: Max number of instances (for resellers)

**Implementation**:
```prisma
model InstanceQuota {
  id          String   @id @default(cuid())
  instanceId  String   @unique
  type        QuotaType // RATE_10MIN, MONTHLY
  limit       Int
  used        Int @default(0)
  resetAt     DateTime?
  updatedAt   DateTime @updatedAt
}
```

**Enforcement**: Middleware in API routes checks quota before allowing operations. Redis for rate limiting (bullmq).

---

## 5. Payment & Billing System (Phase 3+)

### 5.1 Plans & Pricing

**Tier Structure**:
| Plan | Price | Instances | Messages/mo | Sub-instances | Support |
|------|-------|-----------|-------------|---------------|---------|
| Free | $0 | 1 | 1,000 | 0 | Community |
| Basic | $29/mo | 3 | 10,000 | 5 | Email |
| Pro | $99/mo | 10 | 100,000 | 25 | Priority |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Dedicated |

**Add-ons**:
- Extra messages: $0.01/1000
- Extra sub-instance: $10/mo each
- Additional agents: $15/mo each

### 5.2 Billing Workflow

1. **Checkout**: Stripe/PayPal integration
2. **Subscription**: Webhook from payment provider
3. **Invoice**: Monthly auto-generated
4. **Quota Update**: Automatic based on subscription
5. **Overage**: Soft limit (warn) → Hard limit (block)
6. **Dunning**: 3 retries → suspend → cancel

### 5.3 Implementation

- Use Stripe Billing or Lemon Squeezy (simpler)
- Store `Subscription` model in Prisma
- Cron job to reset monthly counters
- Webhook endpoints for payment events
- Admin billing page with invoices

---

## 6. Documentation Strategy

### 6.1 Frontend Documentation Pages

**1. `/docs` - Documentation Hub**
```
├── Getting Started
│   ├── Overview
│   ├── Quick Start (5 min)
│   ├── Installation
│   └── Authentication
├── API Reference
│   ├── Authentication
│   ├── Instances
│   ├── Messaging
│   ├── Groups
│   ├── Templates
│   └── Webhooks
├── Guides
│   ├── Connect WhatsApp
│   ├── Send Messages
│   ├── Create Groups
│   ├── Manage Templates
│   ├── Team Collaboration
│   └── Reseller Setup
├── SDKs & Examples
│   ├── Node.js
│   ├── Python
│   ├── PHP
│   └── cURL Examples
└── FAQ & Troubleshooting
```

**2. Interactive API Explorer**
- Swagger UI / Stoplight Elements
- Auto-generated from backend routes
- "Try it" with sandbox credentials

**3. Component-Level Docs**
- MDX components in codebase
- Storybook integration for UI components

### 6.2 SEO Improvements

**Landing Page (`/landing` or separate domain)**:
- Hero section with value proposition
- Feature grid with icons
- Pricing table (Free/Basic/Pro/Enterprise)
- Testimonials & trust badges
- CTA: "Start Free Trial"
- Schema.org markup
- Meta tags, Open Graph, Twitter Cards
- Blog section for SEO content

**Technical SEO**:
- Server-side rendering for landing pages (Next.js?)
- Sitemap generation
- Robots.txt
- Fast load times (optimize assets)
- Mobile-first responsive design
- Structured data (JSON-LD)
- Canonical URLs

---

## 7. Role-Based Access Control (RBAC) Refinement

### 7.1 Current State

Currently: Simple `User.role` enum (SUPER_ADMIN, ORG_ADMIN, TEAM_AGENT, VIEWER)

### 7.2 Proposed Enhancement

```prisma
model Role {
  id          String   @id @default(cuid())
  name        String   @unique // e.g., "org_admin", "agent", "viewer"
  description String?
  permissions Json // { "instances:read": true, "messages:write": false, ... }
  orgId       String?  // null = system roles
  createdAt   DateTime @default(now())
}

model UserRole {
  id        String   @id @default(cuid())
  userId    String
  roleId    String
  orgId     String   // Org where role applies
  scope     RoleScope // GLOBAL, INSTANCE, CHAT, etc.
  resourceId String? // Specific instance ID if scoped

  @@unique([userId, roleId, orgId])
}
```

### 7.3 Permission System

**Resource-Based Permissions**:
```
{resource}.{action}
- instances.read
- instances.write
- messages.read
- messages.write
- groups.read
- groups.write
- agents.read
- agents.write
- analytics.read
- settings.read
- settings.write
```

**Implementation**:
- Frontend: `usePermission(resource, action)` hook
- Backend: Permission middleware on all routes
- UI: Conditionally render buttons/links based on permissions

---

## 8. Internal Chat Application Enhancement

### 8.1 Current State

Basic chat window with:
- Message list with bubbles
- Input field
- File attachment (images)
- Contact list

### 8.2 Proposed Features

**1. Advanced Messaging**
- Message reactions (emoji)
- Reply threading
- Message editing & deletion
- Forward messages
- Star/pin important messages
- Search in chat history

**2. Agent Tools**
- Quick replies (canned responses)
- Message templates picker
- Transfer chat to another agent
- Internal notes (private to team)
- Chat tags & labels
- Priority flags (urgent, follow-up)
- Customer profile view (from contact data)

**3. UI/UX Improvements**
- Split view: contacts | chat | customer info
- Real-time typing indicators
- Read receipts (✓✓)
- Online status badges
- Dark/light mode
- Keyboard shortcuts (Ctrl+K search, Ctrl+N new chat)
- Message status icons (sending, sent, delivered, read, error)
- Attachment previews (PDF, Doc, Video)

**4. Collaboration**
- @mentions in internal notes
- Chat assignment history
- Conversation merge
- Batch actions (assign, close, tag)

---

## 9. API Documentation & Developer Experience

### 9.1 API Specification

**OpenAPI 3.0 Spec Generation**
- Document all endpoints with examples
- Include request/response schemas
- Authentication methods (API key, JWT)
- Rate limits per endpoint
- Error codes & messages

**Available at**: `https://api.whatsapp.nextmavens.cloud/docs` (Swagger UI)

### 9.2 SDKs

**Generate SDKs** using OpenAPI:
- **Node.js/TypeScript**: `@nextmavens/whatsapp-sdk`
- **Python**: `nextmavens-whatsapp`
- **PHP**: `nextmavens/whatsapp-php`

**SDK Features**:
- Auto-retry with exponential backoff
- Event streaming (webhooks)
- Type-safe models
- Rate limit handling
- Logging integration

### 9.3 Code Examples

**For each use case**:
```javascript
// Send text message
const { WhatsApp } = require('@nextmavens/whatsapp-sdk');
const client = new WhatsApp({ apiKey: 'your-key' });

await client.messages.send({
  instanceId: 'your-instance',
  to: '1234567890@s.whatsapp.net',
  text: 'Hello from NextMavens!'
});
```

---

## 10. Rate Limiting Implementation

### 10.1 Rate Limit Tiers

| Tier | 10-min limit | Monthly limit | Max instances | Sub-instances |
|------|--------------|---------------|---------------|---------------|
| Free | 100 | 1,000 | 1 | 0 |
| Basic | 500 | 10,000 | 3 | 5 |
| Pro | 1,000 | 100,000 | 10 | 25 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited |

### 10.2 Implementation Strategy

**Middleware Stack**:
```typescript
// rateLimitMiddleware.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'ratelimit',
  points: 1000, // Number of requests
  duration: 600, // 10 minutes in seconds
});

export async function rateLimitMiddleware(req, res, next) {
  const key = `rate:${req.user.orgId}:${req.instanceId}`;
  try {
    await rateLimiter.consume(key, 1);
    next();
  } catch (rlRejected) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(rlRejected.msBeforeNext / 1000),
    });
  }
}
```

**Redis Keys**:
- `rate:{orgId}:{instanceId}` - 10-min sliding window
- `quota:{orgId}:messages_monthly` - Monthly counter (reset on billing cycle)

---

## 11. Super Admin Monitoring Dashboard

### 11.1 Dashboard Features

**1. System Overview**
- Server metrics: CPU, RAM, Disk, Network (Grafana integration)
- Backend service health (API, Webhook, Realtime)
- Database connection pool status
- Redis memory & hits/misses
- Error rates & log tail

**2. Tenant Management**
- Table of all organizations with:
  - Instances count (main + sub)
  - Monthly message usage
  - Current plan
  - Status (active, suspended, overdue)
  - Actions (login as, edit quota, suspend)
- Search & filter tenants
- Bulk operations

**3. Revenue Dashboard**
- MRR, ARR, churn rate
- Monthly revenue by plan
- Top customers
- Invoices generated
- Payment success rate

**4. Logs & Debugging**
- Centralized logging (Loki or Papertrail)
- Log levels: debug, info, warn, error
- Filter by org, instance, endpoint
- Export logs
- Real-time log tail

**5. Webhook Health**
- Delivery success rate
- Failed deliveries with retry count
- Webhook response times
- Most common errors

### 11.2 Implementation

**Route Protection**: Only allow SUPER_ADMIN role
**Middleware**: Add `requireSuperAdmin()` guard
**API Endpoints**:
- `GET /admin/overview`
- `GET /admin/tenants`
- `GET /admin/metrics/system`
- `GET /admin/logs`
- `POST /admin/tenant/:id/quota` (adjust quota)
- `POST /admin/tenant/:id/suspend`

---

## 12. SEO & Marketing Site

### 12.1 Landing Page Structure

```
/
├── Hero Section
│   ├── Headline: "Scale Your Business with WhatsApp API"
│   ├── Subhead: "Trusted by 1000+ companies. Easy integration, powerful features."
│   ├── CTA Buttons: "Start Free Trial" | "Book Demo"
│   └── Dashboard screenshot/video
├── Features Grid
│   ├── Multi-Instance Management
│   ├── Team Collaboration
│   ├── Real-time Analytics
│   ├── Webhook Integrations
│   ├── Reseller Program
│   └── Developer-friendly API
├── How It Works (3 steps)
│   1. Sign up & connect WhatsApp
│   2. Integrate our API
│   3. Send messages at scale
├── Pricing Table
│   ├── Free (1 instance, 1K msgs/mo)
│   ├── Basic ($29)
│   ├── Pro ($99)
│   └── Enterprise (custom)
├── Testimonials / Social Proof
├── FAQ Section (schema.org FAQPage)
├── Blog CTA (for content marketing)
└── Footer
    ├── Product links
    ├── Documentation
    ├── API status
    ├── Privacy policy
    ├── Terms of service
    └── Contact
```

### 12.2 Technical SEO

- **Meta tags**: title, description, keywords, canonical
- **Open Graph**: og:title, og:description, og:image, og:url
- **Twitter Cards**: twitter:card, twitter:title, twitter:image
- **JSON-LD**:
  - Organization schema
  - Product schema (pricing)
  - FAQPage schema
  - BreadcrumbList
- **Sitemap**: `/sitemap.xml` auto-generated
- **Robots.txt**: Allow search bots, block admin paths
- **Performance**:
  - Optimize images (WebP, lazy loading)
  - Code splitting
  - Preload critical resources
  - CDN for static assets

---

## 13. Enterprise-Grade Critical Fixes (Phase 1 Priority)

These 15 items are **often overlooked** in messaging SaaS platforms but are **critical for reliability, scaling to 1000+ instances, and SOC2 compliance**. Must be implemented in **Phase 1**.

---

### 13.1 Idempotency for Message Sending

**Problem**: Network retries cause duplicate messages if client doesn't send unique request ID.

**Solution**: Require `Idempotency-Key` header on all send endpoints.

**Implementation**:
```typescript
// POST /whatsapp/instances/:id/send
// Header: Idempotency-Key: uuid-v4

const idempotencyKey = req.headers['idempotency-key'];
if (!idempotencyKey) {
  return reply.status(400).json({ error: 'Idempotency-Key header required' });
}

// Check if already processed
const existing = await prisma.idempotencyKey.findUnique({
  where: { key: idempotencyKey }
});

if (existing) {
  // Return cached response
  return JSON.parse(existing.response);
}

// Process request...
// After successful Evolution API call:
await prisma.idempotencyKey.create({
  data: {
    key: idempotencyKey,
    orgId: user.orgId,
    endpoint: `/whatsapp/instances/${instanceId}/send`,
    response: JSON.stringify(result),
    createdAt: new Date()
  }
});
```

**Database Model**:
```prisma
model IdempotencyKey {
  id        String   @id @default(cuid())
  key       String   @unique // uuid
  orgId     String
  endpoint  String
  response  String   // JSON stringified response
  createdAt DateTime @default(now())

  @@index([orgId, createdAt])
  @@index([key])
}
```

**TTL**: Auto-delete records after 7 days (idempotency keys only needed short-term).

---

### 13.2 Message Queue (BullMQ)

**Problem**: Direct synchronous calls to Evolution API will timeout/block under load. No retry on failures.

**Solution**: Async job queue with BullMQ + Redis.

**Architecture**:
```
API Request
    ↓
Validate + Store Job in Redis (bull)
    ↓
Return jobId (immediate response)
    ↓
Redis Queue
    ↓
Worker Process (separate)
    ↓
Evolution API
    ↓
Update job status (completed/failed)
    ↓
Client polls GET /jobs/:id OR WebSocket notification
```

**Job Types**:
- `send_message`
- `send_media`
- `send_template`
- `create_group`
- `webhook_delivery`

**Worker Implementation**:
```typescript
// worker.ts
import { Queue, Worker } from 'bullmq';

const messageQueue = new Queue('messages', { connection: redis });

const worker = new Worker('messages', async job => {
  if (job.name === 'send_message') {
    const { instanceId, to, text } = job.data;
    const client = await getEvolutionClient(instanceId);
    return await client.sendTextMessage(to, text);
  }
}, { connection: redis });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
  // Optionally emit WebSocket event to notify frontend
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
  // Retry logic automatic via BullMQ
});
```

**Frontend Integration**:
- POST `/whatsapp/instances/:id/send` → returns `{ jobId, status: 'queued' }`
- Client polls `GET /jobs/:id` or subscribes to WebSocket for updates
- UI shows "Sending..." → "Sent" → "Delivered"

---

### 13.3 WhatsApp Rate Protection

**Problem**: WhatsApp bans numbers if messages sent too fast (rate limit violations).

**Solution**: Per-instance throttling before jobs enter BullMQ.

**Implementation**:
```typescript
const rateGuard = async (instanceId: string) => {
  const key = `rate_limit:${instanceId}`;
  const current = await redis.get(key);
  if (current && parseInt(current) >= 20) { // 20 msg/sec max
    throw new HTTPError(429, 'Too many messages, slow down');
  }
  await redis.incr(key);
  await redis.expire(key, 1); // expire in 1 second
};
```

**Queue Configuration**:
```typescript
const messageQueue = new Queue('messages', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    delay: 0, // no delay by default
  },
  // Group by instance to process sequentially per instance
  groupKey: 'instanceId' // ensures one instance's jobs process in order
});
```

**Settings per Plan**:
- Free: 5 msg/sec
- Basic: 10 msg/sec
- Pro: 20 msg/sec
- Enterprise: 50 msg/sec

---

### 13.4 Dead Letter Queue (DLQ)

**Problem**: Failed jobs disappear. No way to debug failures.

**Solution**: BullMQ built-in DLQ + manual monitoring.

**Configuration**:
```typescript
const queue = new Queue('messages', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3, // retry 2 times
    backoff: {
      type: 'exponential',
      delay: 5000, // start with 5s
    },
  },
});

// Add separate DLQ listener
queue.on('failed', async (job, err) => {
  if (job.attemptsMade >= 3) {
    // Move to dead letter queue permanently
    await redis.lpush('bull:dlq:messages', JSON.stringify({
      jobId: job.id,
      name: job.name,
      data: job.data,
      failedReason: err.message,
      failedAt: new Date().toISOString()
    }));
  }
});
```

**DLQ Monitoring**:
- Admin dashboard: "Failed Jobs" tab
- Manual retry capability ("Retry job")
- Export to CSV for analysis
- Alert: notify admin if DLQ > 100 jobs

---

### 13.5 Message Status Updates

**Problem**: Users don't know if message was delivered/read.

**Solution**: Store message status, update via Evolution webhook events.

**Status Flow**:
```
PENDING (job queued)
  ↓ (job starts)
SENDING
  ↓ ( Evolution API returns messageId)
SENT
  ↓ (webhook: messages.update with status)
DELIVERED (arrived on recipient phone)
  ↓ (webhook: messages.update with status)
READ (recipient opened message)
  ↓
FAILED (if error occurs)
```

**Database Updates**:
```prisma
model WhatsAppMessage {
  // existing fields...
  status MessageStatus // QUEUED, SENDING, SENT, DELIVERED, READ, FAILED
  evolutionMessageId String? // Evolution's message ID for tracking
  sentAt DateTime?
  deliveredAt DateTime?
  readAt DateTime?
  failureReason String?
}
```

**Webhook Handler Update**:
```typescript
// In webhook/message-handler.ts
if (event === 'messages.update') {
  const message = await prisma.whatsAppMessage.findFirst({
    where: { evolutionMessageId: payload.key.id }
  });
  if (message) {
    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        status: mapEvolutionStatus(payload.update.status),
        deliveredAt: payload.update.status === 'delivered' ? new Date() : undefined,
        readAt: payload.update.status === 'read' ? new Date() : undefined
      }
    });
  }
}
```

**Frontend**: Show status icons below message bubble:
- ⏳ Queued
- 📤 Sent
- ✓ Delivered
- ✓✓ Read
- ❌ Failed

---

### 13.6 Chat History Pagination

**Problem**: `GET /chats/:id/messages` returns ALL messages. DB/network overload.

**Solution**: Cursor-based pagination with database index.

**API**:
```
GET /whatsapp/instances/:instanceId/chats/:chatJid/messages
Query:
  limit=50 (max 100)
  cursor=base64(encoded timestamp + messageId)

Response:
{
  messages: [],
  nextCursor: "base64...",
  hasMore: true
}
```

**Query**:
```typescript
const messages = await prisma.whatsAppMessage.findMany({
  where: { chatJid },
  orderBy: { createdAt: 'desc' },
  take: limit + 1,
  ...(cursor && {
    cursor: { id: decodeCursor(cursor) },
    skip: 1
  })
});
```

**Database Index** (verify exists):
```sql
CREATE INDEX idx_whatsapp_messages_chat_created ON whatsapp_messages(chat_jid, created_at DESC);
```

**Frontend**: Infinite scroll or "Load More" button.

---

### 13.7 Phone Number Normalization

**Problem**: Users send `0712345678`, `+254712345678`, `254712345678`. Creates duplicate contacts.

**Solution**: Normalize to E.164 format on API boundary.

**Implementation**:
```typescript
import { parsePhoneNumberFromString } from 'libphonenumber-js';

function normalizePhoneNumber(input: string): string {
  // Remove all non-digit characters except +
  const cleaned = input.replace(/[^\d+]/g, '');

  const phoneNumber = parsePhoneNumberFromString(cleaned, 'KE'); // Kenya default

  if (!phoneNumber || !phoneNumber.isValid()) {
    throw new HTTPError(400, 'Invalid phone number');
  }

  return phoneNumber.format('E.164'); // +254712345678
}
```

**Usage**: Call `normalizePhoneNumber()` in message send, contact creation, group add.

**Database**: Store `phoneNumber` in normalized E.164 format. All queries use normalized format.

---

### 13.8 Webhook Replay Protection

**Problem**: Attacker can replay same webhook payload multiple times.

**Solution**: Verify timestamp + nonce (or use Evolution's signature).

**If Evolution signs webhooks** (check Evolution API docs):
```typescript
const signature = req.headers['x-signature'];
const body = req.rawBody; // raw JSON string

const isValid = verifyHmacSignature(
  body,
  signature,
  instance.webhookSecret
);

if (!isValid) {
  throw new HTTPError(401, 'Invalid webhook signature');
}
```

**If no signature from Evolution**:
- Generate nonce = hash of payload + timestamp
- Store in Redis with 5 min TTL
- On duplicate nonce within 5 min → reject (replay attack)

**Implementation**:
```typescript
const payloadHash = crypto.createHash('sha256')
  .update(JSON.stringify(req.body) + req.headers['x-timestamp'])
  .digest('hex');

const redisKey = `webhook:nonce:${payloadHash}`;
const exists = await redis.set(redisKey, '1', 'EX', 300, 'NX'); // NX = only set if not exists

if (!exists) {
  throw new HTTPError(409, 'Duplicate webhook (replay detected)');
}
```

---

### 13.9 Instance Heartbeat Monitoring

**Problem**: WhatsApp sessions silently disconnect. Users only notice when sending fails.

**Solution**: Proactive heartbeat check (polling) + auto-alert.

**Implementation**:
```typescript
// Cron job every 30 seconds
const HEARTBEAT_INTERVAL = 30000;

setInterval(async () => {
  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      status: 'CONNECTED',
      // check last heartbeat > 2 min ago
      lastHeartbeatAt: { lt: new Date(Date.now() - 120000) }
    }
  });

  for (const instance of instances) {
    // Mark as disconnected
    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'DISCONNECTED' }
    });

    // Send notification to org owner
    await sendNotification({
      type: 'INSTANCE_DISCONNECTED',
      orgId: instance.orgId,
      data: { instanceId: instance.id, instanceName: instance.name }
    });
  }
}, HEARTBEAT_INTERVAL);
```

**Update status**: Every successful API call to Evolution → update `lastHeartbeatAt` to `now()`.

---

### 13.10 Search Index for Chats

**Problem**: Searching messages with `LIKE '%keyword%'` is O(n) slow on millions of rows.

**Solution**: Dedicated search engine (Meilisearch or Elasticsearch).

**Recommendation**: **Meilisearch** (simpler, free, fast)

**Setup**:
1. Install Meilisearch (Docker)
2. Create index `messages`
3. Sync messages to search index on creation/update

**Sync Logic**:
```typescript
// After message created in DB
await searchClient.index('messages').addDocuments([{
  id: message.id,
  chatJid: message.chatJid,
  text: message.text,
  sender: message.sender,
  instanceId: message.instanceId,
  orgId: message.orgId,
  createdAt: message.createdAt
}]);

// Search API:
GET /whatsapp/instances/:instanceId/messages/search?q=hello
Response: { hits: [...], total: 42 }
```

**Frontend**: Search box in chat window. Real-time search as user types.

---

### 13.11 Spam & Bot Protection

**Problem**: Public registration endpoints get spammed with fake accounts.

**Solution**: Multi-layer defense.

**Layer 1: CAPTCHA on Signup**
- Use hCaptcha or Turnstile (Cloudflare, privacy-friendly)
- Verify token server-side before creating user

**Layer 2: Domain Email Verification**
- Require email from company domain (not gmail.com) for ORG_ADMIN signup
- Or: Manual review by SUPER_ADMIN for free tier

**Layer 3: IP Reputation**
- Integrate with IPQualityScore or similar API
- Block Tor exit nodes, known VPNs (configurable)
- Rate limit per IP (see Section 3.3)

**Layer 4: Phone Verification** (optional for enterprise)
- Send SMS with code to verify phone number
- WhatsApp Business API requires phone verification anyway

---

### 13.12 Organization Usage Dashboard

**Problem**: Customers ask "How many messages did I send this month?" No self-service.

**Solution**: Cached metrics in Redis, displayed in org dashboard.

**Metrics**:
- Messages sent today
- Messages sent this month
- Active instances count
- Average response time (agent performance)
- Top 10 most active agents

**Calculation**:
- Real-time count: Redis counter per day/month (INCR on each sent message)
- Historical: Daily aggregate table for reporting
- Cache for 5 minutes to avoid DB load

**API**:
```
GET /organizations/:id/usage
Response:
{
  messagesToday: 1247,
  messagesThisMonth: 45823,
  messagesLimit: 100000,
  usagePercentage: 45.8,
  activeInstances: 3,
  topAgents: [
    { agentName: "Alice", messagesHandled: 2341 }
  ]
}
```

---

### 13.13 Data Retention Policies (Cron Cleanup)

**Problem**: Unbounded database growth. Costs spiral. Performance degrades.

**Solution**: Automated TTL cleanup with cron jobs.

**Retention Rules**:
| Table | Retention | Keep Strategy |
|-------|-----------|---------------|
| whatsapp_messages | 90 days | DELETE completed |
| webhook_delivery_logs | 30 days | DELETE completed |
| whatsapp_logs | 30 days | DELETE completed |
| audit_logs | 180 days | DELETE completed (archive to S3 optional) |
| idempotency_keys | 7 days | DELETE completed |

**Cron Job** (daily at 2 AM):
```bash
0 2 * * * /usr/bin/bun run scripts/cleanup-expired-data.ts
```

**Script**:
```typescript
// cleanup-expired-data.ts
const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

await prisma.whatsAppMessage.deleteMany({
  where: { createdAt: { lt: cutoff90d } }
});

await prisma.webhookDeliveryLog.deleteMany({
  where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
});

// ... other tables
```

**Monitoring**: Log count deleted. Alert if > 1M rows deleted (anomaly).

---

### 13.14 Disaster Recovery Plan

**Problem**: "We have backups" is not enough. Need documented, tested recovery process.

**RPO/RTO Targets**:
- **RPO (Recovery Point Objective)**: Max 24 hours data loss (daily backups)
- **RTO (Recovery Time Objective)**: Max 1 hour downtime to restore

**Backup Strategy**:
1. **PostgreSQL**:
   - Daily full backup at 2 AM (pg_dump or pg_basebackup)
   - WAL archiving for point-in-time recovery (PITR)
   - Store offsite: AWS S3, Backblaze B2, or similar
   - Encrypt backups (GPG)

2. **Redis**:
   - RDB snapshot every hour
   - AOF (Append-Only File) for persistence
   - Backup S3

3. **File Storage** (media uploads):
   - **Primary**: Cloudinary (free tier 25GB) OR Cloudflare R2 (pay-as-you-go, no egress)
   - **Archive**: Telegram bot API (free, unlimited, but not officially storage) - for backup only
   - S3 with versioning & cross-region replication (enterprise option)
   - Decision: Use **hybrid strategy** (see Section 18.5)

**Recovery Runbook**:
1. Identify failure scope (DB, Redis, app server, entire region)
2. Notify team (Slack/On-call)
3. Spin up new server from Terraform/Ansible
4. Restore database from latest backup + WAL replay
5. Verify data integrity (row counts, spot checks)
6. Switch DNS to new server
7. Test critical flows (login, send message)
8. Post-mortem: document root cause

**Testing**: Conduct **quarterly disaster recovery drill**. Involve entire team.

---

### 13.15 WebSocket Scaling Architecture

**Problem**: Real-time chat dashboard with WebSocket won't scale past one server if using in-memory.

**Solution**: Socket.IO + Redis Adapter for horizontal scaling.

**Architecture**:
```
Load Balancer (sticky sessions)
    ↓
API Server 1 (Socket.IO) ──┐
API Server 2 (Socket.IO) ──┼── Redis Pub/Sub ── All servers
API Server 3 (Socket.IO) ──┘
```

**Implementation**:
```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL }
});

// Redis pub/sub for scaling
const { createClient } = require('redis');
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));

// Join room per instance
socket.join(`instance:${instanceId}`);

// Broadcast to all servers
io.to(`instance:${instanceId}`).emit('message:new', message);
```

**Frontend**: Reconnection logic + exponential backoff.

**Sticky Sessions** (nginx/load balancer):
```
upstream backend {
  ip_hash;  # or sticky cookie
  server api1:3000;
  server api2:3000;
}
```

---

## 14. Testing Strategy (Enhanced)

### Unit Tests
**Target**: **90%+** coverage (enterprise standard)

**Focus**:
- Business logic services (quota calculation, routing algorithms)
- API route handlers (with mocked DB)
- Utilities (phone normalization, idempotency key generation)

---

### Integration Tests

**Critical Flows** (must automate):
1. Instance lifecycle: create → connect → status → restart → delete
2. Message send full flow: API → Queue → Worker → Evolution mock → Webhook → DB
3. Quota enforcement: send messages until limit → receive 429
4. Webhook delivery: send → retry → DLQ
5. Agent assignment: chat created → auto-assign → agent notified
6. Reseller flow: sub-instance created → separate quota → API key works

---

### E2E Tests (Playwright)

**User Journeys**:
1. Registration → email verification → onboarding → dashboard
2. Create instance → scan QR (mocked) → status CONNECTED → send message
3. Invite agent → agent accepts → assign chat → transfer chat
4. Reseller: create sub-instance for client → client logs in → sends message
5. Payment: subscribe → checkout → webhook → quota updated

---

### Performance & Load Testing

**Tools**: k6 or Artillery

**Scenarios**:
- 1000 concurrent users sending messages
- 100 instances polling status simultaneously
- 10,000 message search query

**Metrics**:
- API p99 < 200ms
- WebSocket connection time < 100ms
- BullMQ queue length < 100 under load
- Database connections < 80% max pool

---

### Security Testing

- **OWASP ZAP** scan on all endpoints
- **Dependency audit**: `npm audit` weekly (automated)
- **Penetration test**: Annual third-party audit (SOC2 requirement)
- **Manual code review**: Focus on auth, RLS, rate limiting

---

## 15. Monitoring & Observability (Phase 8+)

### 15.1 Metrics (Prometheus)

Expose `/metrics` endpoint:

```
# HELP api_requests_total Total API requests
# TYPE api_requests_total counter
api_requests_total{endpoint="/whatsapp/instances",method="GET"} 1234

# HELP api_request_duration_seconds API response time histogram
# TYPE api_request_duration_seconds histogram
api_request_duration_seconds_bucket{le="0.1"} 100
```

**Key Metrics**:
- Request rate, error rate (4xx, 5xx), duration (RED method)
- Queue depth (BullMQ jobs pending)
- Database pool usage
- Redis memory/connections

---

### 15.2 Logging (Structured JSON)

Library: `pino` or `pino-pretty` for dev

**Log Format**:
```json
{
  "timestamp": "2025-03-11T12:34:56.789Z",
  "level": "info",
  "service": "mavens-api",
  "message": "Message sent",
  "orgId": "org_123",
  "instanceId": "inst_456",
  "userId": "user_789",
  "duration": 145,
  "traceId": "abc-def-ghi"
}
```

**Centralized Logging**: Papertrail or Logtail for aggregation + search.

---

### 15.3 Health Checks

Endpoint: `GET /health`

```json
{
  "status": "healthy", // or "degraded" or "unhealthy"
  "timestamp": "2025-03-11T12:34:56Z",
  "checks": {
    "database": { "status": "up", "latency": "5ms" },
    "redis": { "status": "up", "latency": "2ms" },
    "evolution_api": { "status": "up", "latency": "50ms" },
    "disk": { "status": "up", "free_gb": 45.2 },
    "memory": { "status": "up", "used_percent": 67 }
  }
}
```

**Fail threshold**: Any check down → status "unhealthy". Load balancer stops traffic.

---

### 15.4 Alerting

**Critical Alerts** (PagerDuty/Slack):
- API error rate > 1% for 5 min
- Database connection pool > 90%
- Disk space < 10%
- Evolution API down
- Queue backlog > 1000 jobs
- Instances disconnected > 5

**Warning Alerts** (Slack only):
- Error rate 0.5-1%
- Memory > 80%
- Slow queries detected
- DLQ jobs > 10

---

### 13.16 Media Storage Strategy (Hybrid)

**Decision**: Use **multi-tier storage** for cost optimization.

| Tier | Use Case | Cost | Max |
|------|----------|------|-----|
| Cloudinary (primary) | Images, previews | Free 25GB | 500MB |
| R2 (secondary) | Videos, docs | $0.015/GB | 5GB |
| Telegram (archive) | Cheap backup | Free | 2GB |

**Implementation**: Upload → API routes to provider → store URL in DB (never DB bytes).

**DB Model**:
```prisma
model Media {
  id         String   @id @default(cuid())
  url        String
  mimeType   String
  size       Int
  provider   String
  providerId String?
  metadata   Json?
  createdAt  DateTime @default(now())
}
```

---

### 13.17 Message Status Tracking

**Problem**: Users don't know if message delivered/read.

**Solution**: Track status via Evolution webhook.

**Statuses**: PENDING → SENDING → SENT → DELIVERED → READ → FAILED

Add fields to `WhatsAppMessage`:
`status`, `evolutionMessageId`, `sentAt`, `deliveredAt`, `readAt`, `failureReason`

Webhook handler: on `messages.update`, lookup by `evolutionMessageId`, update status.

**Frontend**: Show icons ⏳📤✓✓✓❌ below message bubble.

---

### 13.18 Chat Pagination

**Problem**: Returns all messages → slow.

**Solution**: Cursor-based pagination.

**API**:
`GET /chats/:jid/messages?limit=50&cursor=base64(msgId)`

**Query**: `take(limit+1)`, skip(1) if cursor. Index: `(chat_jid, created_at DESC)`.

**Frontend**: Infinite scroll or "Load More" button.

---

### 13.19 Phone Number Normalization

Normalize to **E.164** format using `libphonenumber-js`.

**Where**: message send, contact creation, group add, webhook inbound.

**DB**: Store normalized. Unique constraint prevents duplicates.

**Frontend**: Display in local format: `phoneNumber.formatInternational()`.

---

### 13.20 Webhook Replay Protection

**If Evolution signs**: Verify HMAC `X-Signature` with `webhookSecret`.

**If no signature**: Generate nonce = hash(payload + timestamp). Store in Redis TTL 5min. Reject duplicate.

---

### 13.21 Instance Heartbeat Monitoring

Cron every 30s: find CONNECTED with `lastHeartbeatAt < now()-2min` → mark DISCONNECTED → notify admin.

Update `lastHeartbeatAt` on every Evolution API call.

---

### 13.22 Search Infrastructure (Meilisearch)

Install Meilisearch, sync messages on CRUD.

**Index**: `{ id, orgId, instanceId, chatJid, text, sender, createdAt }`

**API**: `GET /messages/search?q=hello&instanceId=X` → Meilisearch search with filter.

**Frontend**: Debounced search (300ms).

---

### 13.23 Spam Protection

**Layers**:
1. CAPTCHA on signup (hCaptcha/Turnstile)
2. Domain email verification (block @gmail for ORG_ADMIN)
3. IP reputation (block Tor, known proxies)
4. Throttle: max 10 msgs/recipient/10min

---

### 13.24 Organization Usage Dashboard

Cache metrics in Redis:
- `messages_today:{orgId}`
- `messages_month:{orgId}`
- `active_instances:{orgId}`

API: `GET /orgs/:id/usage`. Display usage meter on dashboard.

---

### 13.25 Data Retention Policies

**Cron daily at 2 AM**:
- messages DELETE WHERE createdAt < 90 days
- logs DELETE WHERE createdAt < 30 days
- webhook_deliveries DELETE WHERE createdAt < 30 days
- audit_logs DELETE WHERE createdAt < 180 days
- idempotency_keys DELETE WHERE createdAt < 7 days

Index `createdAt` for fast deletes. Alert if >1M rows deleted (anomaly).

---

### 13.26 Disaster Recovery Plan (DRP)

**RPO < 24h, RTO < 1h**.

**Backups**:
- PostgreSQL: `pg_dump` daily + WAL → S3 encrypted
- Redis: RDB hourly → S3
- Code: Git

**Quarterly**: Full DR drill (restore to fresh VPS, test, document RTO).

**Annual**: Third-party penetration test + SOC2 audit.

---

### 13.27 Network & DDoS Protection

**Use Cloudflare**:
- DDoS protection, WAF, edge rate limiting
- Hide origin IP (proxy only through Cloudflare)
- IP ACL: allow only Cloudflare ranges to VPS

**Cloudflare rate limits**:
- `/auth/*`: 10/min/IP
- `/instances/*/send`: 60/min/IP
- `/api/*`: 100/min/IP

**VPS firewall** (ufw):
- Allow: 443 (HTTPS), 80 (HTTP→HTTPS), SSH (key-only)
- Block all else

---

### 13.28 Compliance (SOC2 Type II)

**Security**: Encr at rest/in-transit, MFA, audit logs 180d, annual pentest.
**Availability**: 99.9% uptime, DR tested quarterly.
**Confidentiality**: RBAC, background checks, vendor assessments.
**Privacy**: GDPR compliance, DPA available, PII encryption.

Maintain evidence repository (Git).

---

### 13.29 Future-Proofing

- **API versioning**: `/api/v1/`, sunset v1 after 12 months, publish v2
- **Backward compatibility**: never remove webhook fields; maintain SDK compatibility 2 years
- **Migrations**: Add new columns, deprecate old, drop in next major version

---

## 14. Implementation Phases (Updated)

### Phase 1: Foundation & Core Improvements (Week 1-2)

**CRITICAL (Enterprise Reliability)**:
- [ ] **RLS Policies**: Enable RLS on ALL tenant tables and create policies (messages, chats, instances, agents, etc.)
- [ ] **Message Queue**: Implement BullMQ + Redis worker for ALL message sending (text, media, template)
- [ ] **Idempotency**: Add `Idempotency-Key` validation and storage (model + middleware)
- [ ] **Rate Limiting**: Redis-based rate limiter (10-min window) with middleware
- [ ] **Webhook Reliability**: Add retry logic with exponential backoff, dead letter queue, signature verification
- [ ] **Health Checks**: Comprehensive `/health` endpoint (DB, Redis, Evolution, disk, memory)
- [ ] **Audit Logging**: Central audit service + middleware for all sensitive operations

**Backend**:
- [ ] Create database migration for missing models (WhatsAppAgent, WhatsAppTemplate, WhatsAppLog, WhatsAppRoutingQueue, WhatsAppRoutingRule) - see Section 14.1
- [ ] Add proper input validation (Zod schemas) to ALL API routes
- [ ] Add request logging middleware (structured JSON with traceId)
- [ ] Implement request ID tracking (correlation IDs) for debugging
- [ ] Add phone number normalization (libphonenumber-js) on message send
- [ ] Implement message status tracking (PENDING → SENT → DELIVERED → READ)
- [ ] Set up Redis adapter for BullMQ queue
- [ ] Create idempotency key model + middleware
- [ ] Add webhook nonce/replay protection
- [ ] Implement instance heartbeat monitoring (auto-disconnect detection)

**Frontend**:
- [ ] Fix known bugs from `WhatsApp_API_Platform_Plan.json` (see GitHub issues)
- [ ] Replace hardcoded API URL with env variable (Vite)
- [ ] Add error boundaries to all pages (React Error Boundaries)
- [ ] Improve toast notifications (specific messages, auto-dismiss)
- [ ] Add loading skeletons for better UX
- [ ] Implement message status icons (pending/sent/delivered/read/failed)
- [ ] Support pagination in chat message list (cursor-based)
- [ ] Add search in chats (integrate Meilisearch API)

**Code Quality**:
- [ ] ESLint + Prettier setup (enforce on pre-commit)
- [ ] Husky + lint-staged for pre-commit hooks (run ESLint, tests)
- [ ] Enforce TypeScript strict mode (`"strict": true`)
- [ ] Add JSDoc comments to public functions

**Testing (Phase 1 Critical)**:
- [ ] Unit tests for:
  - Idempotency middleware
  - Rate limiter
  - Phone normalization utility
  - Quota calculation logic
- [ ] Integration test: full message send flow (API → queue → worker → mock Evolution)
- [ ] Load test: 100 concurrent sends to verify queue processing

**Deliverable**: **Production-ready core platform** with enterprise reliability (idempotency, queue, rate limiting, health checks, audit log)

---

### Phase 2: Documentation & Developer Experience (Week 3-4)

**Landing Page**:
- [ ] Create new marketing landing page (`/landing`) OR separate domain (nextmavens.com)
- [ ] SEO meta tags & Open Graph for all public pages
- [ ] Schema.org markup (Organization, FAQ, Product)
- [ ] Performance optimization (images to WebP, code splitting, preload)
- [ ] Responsive design (mobile-first)

**API Documentation**:
- [ ] Generate **OpenAPI 3.0** spec using `@fastify/swagger` (or custom)
- [ ] Set up Swagger UI at `/api/docs` (auth required) AND public version at `/docs`
- [ ] Write comprehensive API reference with examples for EVERY endpoint
- [ ] Create SDKs in priority order:
  - **Node.js/TypeScript**: `@nextmavens/whatsapp-sdk`
  - **Python**: `nextmavens-whatsapp`
  - **PHP**: `nextmavens/whatsapp-php`
- [ ] Code examples for all use cases (send text, send media, create group, etc.)
- [ ] Document error codes (400, 401, 403, 404, 429, 500, 503) with resolution steps

**In-App Documentation**:
- [ ] Create `/docs` section with quickstart guide + advanced guides
- [ ] Add integration guide modal (enhance existing endpoint)
- [ ] Interactive API explorer (Swagger UI embedded)
- [ ] Video tutorials (optional but recommended)

**Deliverable**: Complete developer experience (marketing site + API docs + SDKs)

---

### Phase 3: Billing & Payment System (Week 5-6)

**Payment Provider**:
- [ ] Choose **Stripe** (as decided)
- [ ] Create Stripe account + get API keys
- [ ] Set up webhook endpoint for Stripe events (`/webhooks/stripe`)
- [ ] Test in Stripe sandbox (test cards)

**Database Schema** (add to Prisma):
```prisma
model Plan {
  id          String   @id @default(cuid())
  name        String   // "Free", "Basic", "$29", "Pro", "Enterprise"
  price       Float    // monthly price in USD
  interval    String   @default("month")
  limits      Json     // { messages10Min: 1000, messagesMonthly: 10000, instances: 3, subInstances: 5 }
  stripePlanId String? @unique
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

model Subscription {
  id                     String   @id @default(cuid())
  orgId                  String
  planId                 String
  status                 SubscriptionStatus // ACTIVE, CANCELED, PAST_DUE, TRIALING, INCOMPLETE, UNPAID
  stripeSubscriptionId   String?  @unique
  stripeCustomerId       String?
  currentPeriodStart     DateTime
  currentPeriodEnd       DateTime
  cancelAtPeriodEnd      Boolean  @default(false)
  cancelledAt            DateTime?
  trialEndsAt            DateTime?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}
```

**Implementation**:
- [ ] Subscription management (create, update, cancel)
- [ ] Stripe Checkout integration (hosted payment page)
- [ ] Quote management pages (billing history, invoices)
- [ ] PDF invoice generation (use pdf-lib or similar)
- [ ] Quota update cron (runs on billing cycle start, resets monthly counters)
- [ ] Overage handling: soft warning (80%), hard block (100%)
- [ ] Dunning management: 3 retries (1d, 3d, 5d) → suspend after 7 days

**Frontend**:
- [ ] Pricing page (`/pricing`) with plan comparison table
- [ ] Checkout flow (Stripe Checkout redirect)
- [ ] Billing settings page (`/settings/billing`):
  - Current plan, usage meter
  - Payment method (card) management
  - Invoices list (download PDF)
  - Cancel subscription
- [ ] Usage meter widget (X of Y messages used this month)

**Tests**:
- [ ] Mock Stripe webhooks locally
- [ ] Test subscription lifecycle (trial → active → cancel → resume)

**Deliverable**: Complete billing system with Stripe integration, subscription management, invoicing, quota automation

---

### Phase 4: Super Admin Dashboard (Week 7)

**Security**:
- [ ] Protect all `/admin/*` routes with `SUPER_ADMIN` role only
- [ ] Require 2FA for SUPER_ADMIN (enforce in middleware)
- [ ] Audit log all admin actions (see Section 3.9)

**Routes & Pages**:
- `/admin` - Main dashboard with summary cards
- `/admin/tenants` - Organizations list with search/filter
- `/admin/tenants/[id]` - Tenant detail view (instances, usage, team)
- `/admin/system` - Server metrics (CPU, RAM, disk, network, process status)
- `/admin/logs` - Centralized log viewer with filtering
- `/admin/revenue` - MRR, ARR, churn, invoices
- `/admin/webhooks` - Webhook delivery health (success rate, failures)

**Features**:
- [ ] System health monitoring (Grafana embed or custom)
- [ ] Tenant management: view all orgs, filter by plan, status, search
- [ ] Actions: login as tenant (impersonate), adjust quota, suspend/activate
- [ ] Revenue dashboard: charts (could use Chart.js or Recharts)
- [ ] Log tail with filters (level, orgId, instanceId, endpoint)
- [ ] Webhook delivery metrics per instance

**APIs**:
- `GET /admin/overview`
- `GET /admin/organizations`
- `GET /admin/organizations/:id`
- `POST /admin/organizations/:id/quota` (adjust limits)
- `POST /admin/organizations/:id/suspend`
- `GET /admin/metrics/system` (server stats)
- `GET /admin/logs` (aggregated)

**Integration**: Connect to Better Stack (or Grafana) for metrics via API.

**Deliverable**: Full admin monitoring portal with tenant management, system health, revenue analytics

---

### Phase 5: Advanced Chat Features (Week 8-9)

**Messaging**:
- [ ] Message reactions (emoji picker, store in DB `WhatsAppMessage.reactions` JSON)
- [ ] Reply threading (store `replyToMessageId`, UI shows thread)
- [ ] Edit/delete messages (with status tracking, sync to Evolution)
- [ ] Forward messages to multiple chats
- [ ] Star/pin important messages (per user or globally)
- [ ] Full-text search in chat (Meilisearch integration)

**Agent Tools**:
- [ ] Quick replies picker (use `WhatsAppTemplate` table, categorize)
- [ ] Internal notes (private to team, visible in sidebar, store in `ChatNote` table)
- [ ] Chat transfer (POST `/chats/:id/transfer`, track history in `AssignmentHistory` table)
- [ ] Customer profile sidebar (display contact data, previous conversations)
- [ ] Tags & labels (add `ChatTag` model, many-to-many)
- [ ] Priority flags (urgent, low, follow-up) with color coding
- [ ] Canned responses with variables (`{{name}}`, `{{order}}`)

**UI/UX**:
- [ ] Split-pane layout (contacts | chat | customer info) - responsive
- [ ] Real-time typing indicators (WebSocket `typing:start` / `typing:stop`)
- [ ] Read receipts (double checkmarks) - listen to webhook updates
- [ ] Online/offline status badges per contact
- [ ] Keyboard shortcuts modal (Ctrl+K search, Ctrl+N new chat, Ctrl+Enter send)
- [ ] Message context menu (right-click: reply, copy, delete, forward)
- [ ] Drag & drop file upload (images, docs, video)
- [ ] File previews (PDF thumbnails, video player, audio player)

**Real-time** (WebSocket - first pass):
- [ ] Set up Socket.IO server with Redis adapter (see Section 13.15)
- [ ] Connect events: `message:new`, `message:update`, `chat:update`, `agent:status`
- [ ] Replace polling for chat list refresh
- [ ] Add connection status indicator in UI (connected/disconnected)

**Deliverable**: Professional-grade customer support chat interface (comparable to Intercom/Zendesk)

---

### Phase 6: Testing & Quality Assurance (Week 10)

**Unit Tests**:
- Target: **90%+** coverage overall
- Backend: Jest + Supertest for API routes
- Frontend: React Testing Library + Jest
- Run: `npm run test:coverage`

**Integration Tests**:
- [ ] Auth flow (register → verify → login → logout)
- [ ] Instance CRUD with Evolution mock
- [ ] Message send full flow (API → queue → worker → DB)
- [ ] Webhook inbound processing (store message)
- [ ] Quota enforcement test (send until limit)
- [ ] Reseller sub-instance creation + separate quota
- [ ] RBAC: agent cannot access admin routes
- [ ] RLS: attempt cross-org access (should fail)

**E2E Tests (Playwright)**:
- [ ] User journey: Signup → onboarding → create instance → connect → send message
- [ ] Team: admin invites agent → agent joins → assign chat → transfer
- [ ] Reseller: create sub-instance → sub logs in → sends message
- [ ] Payment: subscription → checkout → webhook → quota update
- [ ] Chat: send text → send image → add reaction → edit → delete

**Performance Testing** (k6):
- [ ] Load test: 1000 concurrent message sends (verify queue depth)
- [ ] API latency: p99 < 200ms for all endpoints
- [ ] Database: no N+1 queries (use Prisma `include` strategically)
- [ ] WebSocket: 100 concurrent connections, measure reconnect time

**Security Testing**:
- [ ] OWASP ZAP scan (all endpoints)
- [ ] npm audit (fix all vulnerabilities)
- [ ] Pen test: try to bypass RLS (change orgId in JWT?), tamper with idempotency keys
- [ ] Verify CSP headers (no inline scripts)
- [ ] Verify 2FA enforcement for ORG_ADMIN/SUPER_ADMIN

**Deliverable**: Test suite with >90% coverage, security report, performance benchmarks

---

### Phase 7: Deployment & DevOps (Week 11)

**Infrastructure as Code**:
- [ ] Terraform scripts for:
  - VPS provisioning (Ubuntu 22.04)
  - PostgreSQL + Redis
  - Nginx configuration
  - SSL via Let's Encrypt
  - Firewall rules (ufw)

**Dockerization**:
- [ ] Backend Dockerfile (multi-stage: builder → runner)
- [ ] Frontend Dockerfile (nginx + built assets)
- [ ] Docker Compose for local development (postgres, redis, Evolution API mock)
- [ ] Push images to Docker Hub or private registry

**CI/CD Pipeline** (GitHub Actions):
```yaml
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: npm run test
      - run: npm run build
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: |
          ssh user@vps "cd /opt/backend && git pull"
          ssh user@vps "bun install && bunx prisma migrate deploy"
          ssh user@vps "pm2 reload all"
```

**Backups**:
- [ ] PostgreSQL: Daily pg_dump + WAL archiving → S3 (encrypted)
- [ ] Redis: RDB snapshot hourly → S3
- [ ] Retention: 30 days
- [ ] Test restore monthly (document procedure)
- [ ] Backup monitoring: alert if backup fails

**Monitoring Stack** (choose one):
- Option A: Better Stack (logs + metrics) - easier
- Option B: Prometheus + Grafana + Loki + Alertmanager - more control

**Secret Management**:
- [ ] Migrate from `.env` to **Doppler** or **HashiCorp Vault**
- [ ] Rotate all secrets (JWT secret, DB password, Evolution API key)
- [ ] Add secret rotation schedule (quarterly)

**Zero-Downtime Deploys**:
- [ ] Use `pm2 reload` (not `restart`) for API
- [ ] Frontend: HTTP cache headers (Cache-Control: max-age=31536000 for immutable assets)
- [ ] Blue-green or rolling update strategy if multiple servers

**Deliverable**: Production-grade deployment pipeline with IaC, backups, monitoring, zero-downtime deploys

---

### Phase 8: Real-time WebSocket & Polish (Week 12)

**WebSocket Full Implementation**:
- [ ] Socket.IO server with Redis adapter (see Section 13.15)
- [ ] Authenticate WebSocket connections with JWT
- [ ] Room-based: `socket.join('instance:' + instanceId)`
- [ ] Events:
  - `message:new` - new incoming message (broadcast to instance room)
  - `message:update` - status update (delivered, read)
  - `chat:update` - chat list changed (new chat, last message)
  - `agent:status` - agent availability changed
  - `queue:update` - routing queue changed
- [ ] Reconnection logic with exponential backoff (socket.io built-in)
- [ ] Connection status UI indicator (green dot, reconnect button)
- [ ] Fallback to polling if WebSocket fails (graceful degradation)

**Remaining Chat Features** (if not done in Phase 5):
- [ ] File attachments: documents, video, audio, location
- [ ] Message search (Meilisearch)
- [ ] Bulk actions (select multiple chats, assign, close)

**Final Polish**:
- [ ] Dark mode toggle (system preference detection)
- [ ] i18n: Internationalization framework (react-i18next), 2 languages (EN, ES)
- [ ] Performance: Lighthouse score > 90 (PA)
- [ ] Accessibility: WCAG 2.1 AA compliance audit
- [ ] Error boundaries + sentry error tracking
- [ ] Progressive Web App (PWA) manifest (optional)

**Testing**:
- [ ] Load test WebSocket: 1000 concurrent connections
- [ ] Test reconnection scenarios (network drop, server restart)
- [ ] Verify message ordering (FIFO per instance)

**Deliverable**: Complete real-time experience + production polish + multi-language + accessibility

---

## 15. Database Schema Migrations (Critical)

---

### Phase 2: Documentation & Developer Experience (Week 3-4)

**Landing Page**:
- [ ] Create new marketing landing page (`/landing`)
- [ ] SEO meta tags & Open Graph
- [ ] Schema.org markup (Organization, FAQ, Product)
- [ ] Performance optimization (images, code splitting)
- [ ] Responsive design for mobile

**API Documentation**:
- [ ] Generate OpenAPI 3.0 spec from code
- [ ] Set up Swagger UI at `/api/docs`
- [ ] Write comprehensive API reference
- [ ] Create SDKs (Node.js first, then Python)
- [ ] Add code examples for common use cases

**In-App Documentation**:
- [ ] Create `/docs` section with guides
- [ ] Add integration guide modal (enhance existing)
- [ ] Interactive quickstart wizard
- [ ] Video tutorials (optional)

**Deliverable**: Marketing site + complete API docs

---

### Phase 3: Billing & Payment System (Week 5-6)

**Payment Provider Setup**:
- [ ] Choose provider (Stripe recommended)
- [ ] Create account & get API keys
- [ ] Set up webhook endpoint for events
- [ ] Test in sandbox mode

**Database Schema**:
```prisma
model Subscription {
  id              String   @id @default(cuid())
  orgId           String
  planId          String
  status          SubscriptionStatus // ACTIVE, CANCELED, PAST_DUE, TRIALING
  stripeSubId     String?  @unique
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean @default(false)
  createdAt       DateTime @default(now())
}

model Plan {
  id          String   @id @default(cuid())
  name        String   // "Free", "Basic", "Pro", "Enterprise"
  price       Float    // monthly price
  interval    String   // "month"
  limits      Json     // { instances: 3, messages: 10000, subInstances: 5 }
  stripePlanId String? @unique
}
```

**Implementation**:
- [ ] Subscription CRUD pages in admin UI
- [ ] Billing history page
- [ ] Invoice generation (PDF)
- [ ] Quota update cron (monthly)
- [ ] Overage handling (warn → block)
- [ ] Dunning management (retries, suspension)
- [ ] Refund workflow

**Frontend**:
- [ ] Pricing page with plan comparison
- [ ] Checkout flow (Stripe Checkout)
- [ ] Billing settings page
- [ ] Usage meter (show current usage vs limit)

**Deliverable**: Complete billing system with Stripe integration

---

### Phase 4: Super Admin Dashboard (Week 7)

**New Routes**:
- `/admin` → Main dashboard
- `/admin/tenants` → Organizations list
- `/admin/tenants/[id]` → Tenant detail
- `/admin/system` → Server metrics
- `/admin/logs` → Centralized logs
- `/admin/revenue` → Billing reports

**Features**:
- [ ] System health monitoring (CPU, RAM, disk)
- [ ] Service status (API, webhook, realtime)
- [ ] Tenant list with filters
- [ ] Usage analytics per tenant
- [ ] Revenue dashboard
- [ ] Webhook delivery health
- [ ] Log viewer with filtering
- [ ] Impersonate tenant (login as)
- [ ] Bulk actions (suspend, delete, adjust quota)

**Security**:
- [ ] Ensure only SUPER_ADMIN can access
- [ ] Audit log all admin actions
- [ ] Add 2FA requirement for super admin

**Deliverable**: Complete admin monitoring portal

---

### Phase 5: Advanced Chat Features (Week 8-9)

**Messaging**:
- [ ] Message reactions (store in DB, send to Evolution)
- [ ] Reply threading UI
- [ ] Edit/delete messages (with status)
- [ ] Forward messages to multiple chats
- [ ] Search in chat history (Elasticsearch or pg trigram)
- [ ] Star/pin important messages
- [ ] File attachments beyond images (PDF, video, audio)

**Agent Tools**:
- [ ] Quick replies picker with categories
- [ ] Internal notes (visible only to team)
- [ ] Chat transfer with history
- [ ] Customer profile sidebar (from contact data)
- [ ] Tags & labels management
- [ ] Priority flags (urgent, low, follow-up)
- [ ] Canned responses with variables (e.g., `{{name}}`)

**UI/UX**:
- [ ] Split-pane layout (contacts | chat | info)
- [ ] Real-time typing indicators
- [ ] Read receipts (double check)
- [ ] Online status per contact
- [ ] Keyboard shortcuts reference modal
- [ ] Message context menu (right-click)
- [ ] Drag & drop file upload

**Real-time Updates** (partial WebSocket):
- [ ] New message push
- [ ] Chat status updates
- [ ] Agent assignment alerts
- [ ] Message read status
- [ ] Contact online status

**Deliverable**: Professional customer support chat interface

---

### Phase 6: Testing & Quality Assurance (Week 10)

**Unit Tests** (Jest + Testing Library):
- [ ] All React components (shallow rendering)
- [ ] Custom hooks (useWhatsApp, useAuth)
- [ ] Utility functions
- [ ] Backend services (evolution-api-client)
- [ ] API route handlers (supertest)

**Integration Tests**:
- [ ] Authentication flow
- [ ] Instance creation & connection
- [ ] Message send/receive
- [ ] Webhook processing
- [ ] Team invitation flow
- [ ] Quota enforcement

**E2E Tests** (Playwright):
- [ ] User registration → onboarding → dashboard
- [ ] Create instance → scan QR → connect
- [ ] Send message → receive reply
- [ ] Create group → add participants
- [ ] Create agent → assign chat → transfer
- [ ] Invite team member → login as new user

**Performance**:
- [ ] Lighthouse audit (score > 90)
- [ ] Bundle size analysis
- [ ] API response time monitoring (p99 < 200ms)
- [ ] Database query optimization

**Security**:
- [ ] OWASP ZAP scan
- [ ] Dependency vulnerability audit (npm audit)
- [ ] Penetration testing basics
- [ ] Input validation everywhere
- [ ] SQL injection prevention (Prisma is safe)
- [ ] XSS prevention (sanitize message text)
- [ ] CSRF protection (if needed)

**Deliverable**: Test suite with >80% coverage, security report

---

### Phase 7: Deployment & DevOps (Week 11)

**Backend**:
- [ ] Dockerize backend (multi-stage build)
- [ ] Docker Compose for local dev (postgres, redis)
- [ ] CI/CD pipeline (GitHub Actions or similar)
- [ ] Automated database migrations on deploy
- [ ] Health check endpoints
- [ ] Structured JSON logging (pino)
- [ ] PM2 config or Kubernetes manifests
- [ ] Environment-specific configs (dev/staging/prod)

**Frontend**:
- [ ] Dockerize frontend (nginx)
- [ ] CI/CD for frontend build & deploy
- [ ] Cache headers for static assets
- [ ] CDN configuration (Cloudflare or similar)
- [ ] SSL/TLS (Let's Encrypt)
- [ ] HTTP/2 enabled

**Monitoring**:
- [ ] Set up Prometheus + Grafana OR
- [ ] Use external service (Datadog, New Relic, Better Stack)
- [ ] Error tracking (Sentry)
- [ ] Uptime monitoring (UptimeRobot)
- [ ] Log aggregation (Loki, Papertrail)

**Backups**:
- [ ] Automated PostgreSQL backups (daily)
- [ ] Backup retention policy (30 days)
- [ ] Test restore procedure
- [ ] Encrypted offsite storage (S3)

**Deliverable**: Production-ready deployment pipeline

---

### Phase 8: Real-time & WebSocket (Week 12)

**WebSocket Server** (extend existing realaltime service):
- [ ] Set up Socket.io or native WebSocket
- [ ] Authentication on connect (JWT)
- [ ] Room-based subscriptions (per instance)
- [ ] Events:
  - `message:new` → push new incoming message
  - `message:update` → message edited/deleted
  - `chat:update` → chat status, last message
  - `agent:status` → agent online/offline
  - `queue:update` → queue changes
  - `connection:update` → WhatsApp connection state

**Frontend Integration**:
- [ ] Socket.io client setup
- [ ] Realtime hook `useRealtime(event, callback)`
- [ ] Replace interval polling for:
  - Chat list updates
  - New message notifications
  - Agent status
  - Queue length
- [ ] Reconnection logic
- [ ] Connection status indicator

**Performance**:
- [ ] Redis adapter for Socket.io (scale horizontally)
- [ ] Horizontal scaling with sticky sessions
- [ ] Message buffering for offline clients

**Deliverable**: Real-time updates for all critical data

---

## 17. Database Schema Migrations (Critical)

### 16.1 Missing Models (Verify & Create)

Based on current schema analysis, these models are referenced in the plan. Verify they exist in `schema.prisma`:

**Core WhatsApp** (likely already exists):
- ✅ `WhatsAppInstance`
- ✅ `WhatsAppMessage`
- ✅ `WhatsAppChat`
- ✅ `WhatsAppContact`

**Team Collaboration** (check existence):
- ✅ `WhatsAppAgent` (with `status: AgentStatus`, `currentLoad`, `maxLoad`)
- ✅ `WhatsAppAssignment` (with `status: AssignmentStatus`)
- ✅ `WhatsAppRoutingQueue` (queue management)
- ✅ `WhatsAppRoutingRule` (with `type: RoutingRuleType`)
- ⚠️  `AssignmentHistory` (for transfers) - **NEW** - recommend adding

**Webhook & Logging**:
- ✅ `WebhookSubscription` (already exists)
- ✅ `WebhookDeliveryLog` (already exists)
- ✅ `WhatsAppLog` (instance logs)

**Quota & Usage**:
- ⚠️  `QuotaUsage` (track rate & monthly usage) - **NEW** (see Section 2.6)

**Reseller**:
- ✅ `WhatsAppInstance.isSubInstance`, `parentInstanceId` - already in schema
- ⚠️  `ResellerProfile` (optional - could be extra fields on `Organization`) - **DECISION**: Use `Organization.isReseller` + `Organization.resellerLimits JSON`

**Billing** (Phase 3):
- ⚠️  `Plan` (new)
- ⚠️  `Subscription` (new)

**Authentication & Security** (Section 3):
- ✅ `AuditLog` (exists) - ensure covers all events
- ✅ `Session` (exists) - ensure `lastSeenAt` updated on activity
- ⚠️  `PasswordResetToken` (new) - **NEW**
- ⚠️  `IdempotencyKey` (new) - **NEW** (see Section 13.1)

**Search** (external, not DB):
- Meilisearch index `messages` (sync on message create/update/delete)

### 16.2 Migration Commands

```bash
# 1. Update schema.prisma with all missing models
cd /home/ken/next-mavens-vps/src/server/database
# Edit schema.prisma (add models defined in this plan)

# 2. Generate new migration
bunx prisma migrate dev --name enterprise_enhancements

# 3. Review generated migration SQL
cat prisma/migrations/*/migration.sql

# 4. Apply to production (after testing locally)
bunx prisma migrate deploy

# 5. Regenerate Prisma client
bunx prisma generate

# 6. Verify no type errors
cd /home/ken/next-mavens-vps
bun run build

# 7. Restart services
pm2 restart mavens-api mavens-realtime mavens-webhook
```

### 16.3 Backfill Data Migrations

Some tables (like `QuotaUsage`) require backfilling for existing records:

```sql
-- Example: Backfill QuotaUsage for all existing instances
INSERT INTO "QuotaUsage" (id, org_id, instance_id, type, used, limit, period_start, created_at)
SELECT
  gen_random_uuid(),
  wi.org_id,
  wi.id,
  'RATE_10MIN',
  0,
  COALESCE((org.limits->>'messages10Min')::int, 1000),
  date_trunc('day', now()),
  now()
FROM whatsapp_instances wi
JOIN organizations org ON wi.org_id = org.id
WHERE wi.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "QuotaUsage" qu
    WHERE qu.instance_id = wi.id AND qu.type = 'RATE_10MIN'
  );
```

Add similar backfill scripts for:
- `Subscription` (create trial for existing orgs)
- `IdempotencyKey` (not needed - starts fresh)

### 16.4 Required Indexes (Performance)

Ensure these indexes exist (may be auto-generated by Prisma):

```sql
-- Tenant isolation
CREATE INDEX idx_whatsapp_instances_org_deleted ON whatsapp_instances(org_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_messages_org_created ON whatsapp_messages(org_id, created_at DESC);
CREATE INDEX idx_whatsapp_chats_org_updated ON whatsapp_chats(org_id, updated_at DESC);
CREATE INDEX idx_whatsapp_agents_org_status ON whatsapp_agents(org_id, status);

-- Chat pagination
CREATE INDEX idx_whatsapp_messages_chat_created ON whatsapp_messages(chat_jid, created_at DESC);

-- Quota enforcement
CREATE INDEX idx_quota_usage_active ON quota_usages(org_id, instance_id, type, period_start);

-- Idempotency
CREATE INDEX idx_idempotency_key_lookup ON idempotency_keys(key, created_at);

-- Audit logging
CREATE INDEX idx_audit_log_user_action ON audit_logs(user_id, action, created_at DESC);
CREATE INDEX idx_audit_log_created ON audit_logs(created_at DESC);
```

---

## 17. Deployment Checklist (Enterprise)

### Pre-deploy
- [ ] All tests pass: `npm run test:coverage` (coverage >90%)
- [ ] TypeScript compile: `npm run build` (no errors)
- [ ] Lint all files: `npm run lint` (fix all issues)
- [ ] Database migration created & reviewed: `bunx prisma migrate dev`
- [ ] Migration applied to staging first: `bunx prisma migrate deploy` (on staging)
- [ ] Environment variables updated in deployment config (not in Git)
- [ ] Secrets rotated if needed (JWT, DB password, Evolution API key)
- [ ] Backup created pre-deploy
- [ ] Changelog updated (what changed, how to rollback)

### Deploy Backend (Multiple Servers)

**Infrastructure:**
- Load balancer (nginx/HAProxy) with sticky sessions for WebSocket
- 2+ API servers for redundancy
- PostgreSQL primary + read replica
- Redis (v5+ or Valkey) with persistence
- Object storage (S3/R2) for media

**Zero-Downtime Deploy:**
```bash
# On each server (rolling update, 1 at a time):
ssh api-server-1

# 1. Pull code
cd /opt/backend
git pull origin main

# 2. Install deps
bun install --frozen-lockfile

# 3. Run migrations (coordinated - one server at a time)
bunx prisma migrate deploy

# 4. Regenerate Prisma client
bunx prisma generate

# 5. Warm up (optional)
bun run build

# 6. Reload PM2 (zero-downtime)
pm2 reload mavens-api
pm2 reload mavens-realtime
pm2 reload mavens-webhook

# 7. Verify health
curl https://api.whatsapp.nextmavens.cloud/health | jq .

# 8. Check logs for errors
pm2 logs --lines 100 | grep -i error

# 9. Move to next server
```

**PM2 Configuration** (ecosystem.config.js):
```javascript
module.exports = {
  apps: [
    {
      name: 'mavens-api',
      script: './src/server/index.ts',
      instances: 'max', // use all CPU cores
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'mavens-realtime',
      script: './src/server/realtime/index.ts',
      instances: 1,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'mavens-webhook',
      script: './src/server/webhook/index.ts',
      instances: 2,
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' }
    }
  ]
};
```

---

### Deploy Frontend

**Build & Deploy:**
```bash
# 1. Build on CI/CD runner or locally
npm ci
npm run build

# 2. Upload to S3/Cloudflare R2 + CDN OR
# copy to nginx servers (if self-hosted)
rsync -avz dist/ user@web-1:/var/www/whatsapp-admin/
rsync -avz dist/ user@web-2:/var/www/whatsapp-admin/

# 3. Set permissions (if static file server)
ssh web-1 "chown -R www-data:www-data /var/www/whatsapp-admin"
ssh web-2 "chown -R www-data:www-data /var/www/whatsapp-admin"

# 4. Reload nginx (zero-downtime)
ssh web-1 "sudo systemctl reload nginx"
ssh web-2 "sudo systemctl reload nginx"

# 5. Invalidate CDN cache (Cloudflare)
curl -X POST "https://api.cloudflare.com/client/v4/zones/zone-id/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

**Cache Headers** (nginx config):
```
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

---

### Infrastructure as Code (IaC)

**Terraform Modules**:
```hcl
# main.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0"
  # ...
}

module "postgres" {
  source  = "terraform-aws-modules/rds/aws"
  version = "6.0"
  # ...
}

module "redis" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "3.0"
  # ...
}

module "lb" {
  source  = "terraform-aws-modules/elb/aws"
  version = "3.0"
  # ...
}
```

**Store Terraform state in S3** with DynamoDB locking.

**Apply**:
```bash
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

---

### CI/CD Pipeline (GitHub Actions)

**.github/workflows/deploy.yml**:
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run lint
      - run: bun run test:coverage
      - run: bun run build
      - run: bun run docker:build  # if using Docker

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/backend
            git pull origin main
            bun install
            bunx prisma migrate deploy
            bunx prisma generate
            pm2 reload all
            systemctl reload nginx

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - name: Deploy to S3
        uses: jakejarvis/s3-sync-action@v0.5.1
        with:
          args: --delete
        env:
          AWS_S3_BUCKET: ${{ secrets.S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: us-east-1
          SOURCE_DIR: 'dist'
```

---

### Secrets Management

**Decision**: Use **Doppler** (simpler) OR **HashiCorp Vault** (more control).

**Doppler Setup**:
1. Sign up at doppler.com
2. Create workspace, project (backend, frontend)
3. Add secrets in UI
4. Install Doppler CLI on VPS: `curl -sT https://get.doppler.com/install.sh | sudo sh`
5. Configure secret sync: `doppler configure set --token $DOPPLER_TOKEN`
6. Run app with: `doppler run -- bun start`

**Vault Alternative** (if self-hosted):
```bash
# Store secret
vault kv put secret/backend/database url=postgresql://...

# Retrieve in app
const secret = await vault.read('secret/backend/database');
```

**Rotate Secrets**:
- JWT secret: every 90 days (requires user re-login)
- Database password: every 180 days (use rolling update)
- Evolution API key: every 6 months (contact Evolution provider)

---

### Backups & Disaster Recovery

**PostgreSQL**:
```bash
# Daily full backup via cron (2 AM)
0 2 * * * pg_dump -h localhost -U postgres whatsapp_db | gzip > /backups/db-$(date +\%Y\%m\%d).sql.gz

# Upload to S3
aws s3 cp /backups/db-$(date +\%Y\%m\%d).sql.gz s3://backups/whatsapp-platform/postgres/

# Retention: delete local backups > 7 days, S3 backups > 30 days
0 3 * * * find /backups -name "*.sql.gz" -mtime +7 -delete
```

**Redis**:
```bash
# RDB snapshot already configured (every hour, 1 day retention)
# Additionally: save to S3 daily
0 4 * * * cp /var/lib/redis/dump.rdb /backups/redis-$(date +\%Y\%m\%d).rdb && aws s3 cp /backups/redis-$(date +\%Y\%m\%d).rdb s3://backups/whatsapp-platform/redis/
```

**Recovery Drill** (quarterly):
1. Spin up fresh VPS
2. Restore PostgreSQL from S3 backup
3. Restore Redis RDB
4. Run application
5. Verify data integrity (row counts)
6. Document time to recovery (target: < 1 hour)

---

### Monitoring & Alerting

**Production Stack** (recommended):
- **Metrics**: Better Stack Metrics (free tier) OR Prometheus + Grafana self-hosted
- **Logs**: Better Stack Logs (formerly Logtail) - simple, integrates with Laravel ecosystem
- **Errors**: Sentry (free tier, great for Node.js)
- **Uptime**: UptimeRobot (free 5min checks)

**Alerting Rules**:
- **Critical** (PagerDuty/SMS):
  - API error rate > 1% for 5 min
  - DB connection pool exhausted
  - Disk > 90%
  - Evolution API down
- **Warning** (Slack):
  - Error rate 0.5-1%
  - Memory > 80%
  - Queue backlog > 100
  - Any 5xx error

**Dashboards**:
1. System health (CPU, RAM, Disk, Network, Process)
2. API metrics (request rate, error rate, p50/p95/p99)
3. Business metrics (active users, messages sent, instances)
4. Evolution API health (response time, error rate)

---

### Post-deploy Validation

**Smoke Tests** (automated script):
```bash
#!/bin/bash
# smoke-tests.sh
set -e

API="https://api.whatsapp.nextmavens.cloud"
FRONTEND="https://whatsapp.nextmavens.cloud"

echo "Checking health endpoint..."
curl -f $API/health | jq .

echo "Checking authentication..."
TOKEN=$(curl -X POST $API/auth/login -d '{"email":"admin@test.com","password":"..."}' | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" -f $API/auth/whoami | jq .

echo "Checking instance list..."
curl -H "Authorization: Bearer $TOKEN" -f $API/whatsapp/instances | jq .

echo "Frontend status..."
curl -f $FRONTEND | grep -i "NextMavens"

echo "✅ All smoke tests passed"
```

Run after deploy: `bash smoke-tests.sh`

**Feature Flags** (optional but recommended):
- Use Unleash or PostHog for feature flags
- Gradual rollout: 10% → 50% → 100%
- Quick rollback if issue detected

---

### Rollback Procedure

If deploy causes issues:

**Backend**:
```bash
# On each server, one at a time:
pm2 stop mavens-api mavens-realtime mavens-webhook
git checkout <previous-working-commit>
bun install
bunx prisma migrate resolve <previous-migration> # rollback migration if needed
pm2 start mavens-api mavens-realtime mavens-webhook
```

**Database migration rollback** (if needed):
```bash
bunx prisma migrate resolve <migration-name-to-undo>  # marks as down
# OR manually write down migration and apply
```

**Frontend**:
```bash
# Roll back to previous build
aws s3 cp s3://backups/whatsapp-admin/previous/ s3://whatsapp-admin/ --recursive
# OR if using git pull on server:
git revert <bad-commit>
npm run build
```

**Monitor**: After rollback, verify smoke tests pass, error rates return to baseline.

---

## 18. Product Roadmap (Beyond Phase 8)

---

 (Beyond Phase 8)

### Q2 2026
- AI-powered message suggestions (Gemini API)
- Bulk messaging (broadcast to multiple contacts)
- Chatbot builder (visual workflow)
- Email ↔ WhatsApp integration
- Shopify/WooCommerce connectors
- Advanced reporting (custom dashboards)

### Q3 2026
- Multi-language support (i18n)
- White-label solution (custom branding per org)
- SSO/SAML for enterprise
- Mobile app (React Native)
- Voice calls via WhatsApp
- WhatsApp Business API cloud installation

### Q4 2026
- AI agent automation (auto-reply based on training data)
- Sentiment analysis dashboard
- Predictive analytics
- Advanced reseller portal (client management)
- Marketplace for integrations

---

## 19. Success Metrics & KPIs

**Product Metrics**:
- Monthly Active Users (MAU)
- Daily Active Users (DAU)
- Instance connection rate (% of instances connected)
- Message volume growth
- Feature adoption (e.g., % using templates)

**Business Metrics**:
- MRR, ARR
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Churn rate
- Conversion rate (Free → Paid)

**Technical Metrics**:
- API response time (p50, p95, p99)
- Uptime (99.9% target)
- Error rate (< 0.1%)
- Page load time (Lighthouse > 90)
- Webhook delivery success rate (> 99.5%)

---

## 20. Risk Mitigation (Enterprise-Grade)

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Evolution API changes** | High | Medium | Abstract integration layer in `evolution-api-client.ts`; track releases; integration tests |
| **WhatsApp rate limit/ban** | High | Low | Per-instance throttling (20 msg/sec max); queue with rate control; monitor bans |
| **Database performance** | High | Medium | Add indexes (see Section 16.4); query monitoring; read replicas at 100K msgs/day |
| **Scaling issues** | Medium | Medium | Load test before launch; auto-scaling; Redis cluster for BullMQ; CDN for assets |
| **Payment failures** | High | Low | Stripe webhooks; retry logic; manual invoice override; grace period 7 days |
| **Data privacy breach** | Critical | Low | Encrypt PII at rest (PostgreSQL pgcrypto); audit logs; GDPR compliance; annual pentest |
| **Team turnover** | Medium | Medium | Comprehensive documentation; pair programming; RFC process for major changes |
| **RLS bypass bug** | Critical | Low | Defense in depth: (1) middleware orgGuard, (2) RLS policies, (3) regular security audit |
| **Queue failure (BullMQ)** | High | Low | Monitor queue depth; DLQ alerts; persistent Redis with AOF; dead-letter monitoring |
| **Disaster (data loss)** | Critical | Low | Daily backups + WAL archiving; quarterly DR drills; RPO < 24h, RTO < 1h (see Section 14) |
| **Webhook delivery failure** | High | Medium | 5 retries with exponential backoff; DLQ; alert on >5% failure rate |
| **Message send idempotency failure** | Medium | Low | Idempotency-Key enforcement; Redis cache with 7-day TTL; test duplicate sends |
| **Search index out of sync** | Medium | Low | Sync on every message write; daily full reindex job; monitor index lag |
| **Third-party API outage (Evolution)** | High | Medium | Circuit breaker pattern (bull-board); fallback queue; SLA monitoring; incident post-mortem |
| **Dependency vulnerabilities** | High | Low | `npm audit` in CI; Dependabot auto-updates; weekly security scan |
| **2FA bypass (if implemented)** | Critical | Low | Enforce 2FA for SUPER_ADMIN/ORG_ADMIN in middleware; test attack scenarios |
| **Insider threat (rogue employee)** | Critical | Low | RBAC with least privilege; audit logs; SOX/SOC2 controls; terminated employee cleanup |
| **CAPTCHA bypass (spam signup)** | Medium | Medium | hCaptcha/Turnstile on signup; domain email verification; IP reputation; review queue |
| **Telecom/SMS provider failure** (if using SMS 2FA) | Medium | Low | Multi-provider fallback (Twilio + AWS SNS); monitoring; email 2FA backup |
| **SSL certificate expiry** | High | Low | Automated Let's Encrypt renewal (certbot auto); monitor expiry; alert 30 days before |
| **DNS hijack/misconfig** | Critical | Low | Use Cloudflare (2FA enabled); DNS record monitoring; audit log all changes |
| **Cost overrun (unexpected usage)** | Medium | Medium | Quota enforcement; alert at 80%, 100%; monthly billing review; auto-scale pricing alerts |

**Key Principle**: **Defense in depth**. No single point of failure. Each risk has at least 2 mitigations (prevention + detection + response).

---

## 21. Required Resources

**Personnel**:
- 1 Backend Developer (Fastify/TypeScript)
- 1 Frontend Developer (React/TypeScript)
- 1 DevOps Engineer (deployment, monitoring)
- 1 UX/UI Designer (optional, for final polish)

**Tools & Services**:
- Stripe/PayPal account
- Sentry or similar (error tracking)
- Monitoring (Grafana, Datadog, Better Stack)
- CI/CD (GitHub Actions, GitLab CI)
- Email service (Resend, SendGrid) for transactional emails
- SMS for 2FA (Twilio, AWS SNS) (optional)

---

## 22. Immediate Next Steps

**Today/This Week**:
1. ✅ Review this plan with stakeholder
2. ✅ Prioritize phases (maybe combine Phase 1 & 2)
3. ⬜ Fix all critical bugs from existing `WhatsApp_API_Platform_Plan.json`
4. ⬜ Create & apply remaining Prisma migrations
5. ⬜ Deploy fixed version to production
6. ⬜ Set up Stripe/PayPal sandbox

**Week 2**:
- Start Phase 1 implementation
- Begin landing page design
- Create OpenAPI spec

**Week 3-4**:
- Complete Phase 1
- Start Phase 2 (documentation)

---

## 23. Appendix

### A. Technology Stack Summary

**Frontend**:
- React 19
- TypeScript 5.8
- Vite 6
- Tailwind CSS 4
- React Query 5
- React Router 7
- Motion (animations)

**Backend**:
- Fastify 5
- TypeScript
- Prisma ORM
- PostgreSQL 15+
- Redis (BullMQ for rate limiting & jobs)
- Socket.io (for real-time)

**Infrastructure**:
- Ubuntu 22.04 VPS
- Nginx (reverse proxy)
- PM2 (process manager)
- Let's Encrypt (SSL)
- Cloudflare (CDN, optional)

**Monitoring**:
- Better Stack (logs) OR Grafana+Loki
- Sentry (errors)
- UptimeRobot (uptime)

### B. Environment Variables

**Backend (.env)**:
```
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."
EVOLUTION_API_URL="..."
EVOLUTION_API_KEY="..."
EVOLUTION_WEBHOOK_SECRET="..."
REDIS_URL="redis://..."
STRIPE_SECRET_KEY="..."
STRIPE_WEBHOOK_SECRET="..."
SENTRY_DSN="..."
NODE_ENV="production"
```

**Frontend (.env)**:
```
VITE_API_URL="https://api.whatsapp.nextmavens.cloud"
VITE_WS_URL="wss://api.whatsapp.nextmavens.cloud"
VITE_APP_URL="https://whatsapp.nextmavens.cloud"
VITE_STRIPE_PUBLIC_KEY="..."
```

---

## Conclusion

This comprehensive plan provides a clear roadmap to transform the current WhatsApp Evolution API platform into a world-class, enterprise-ready SaaS product. By following the phased approach, we ensure:

✅ **Quality**: Each phase builds on stable foundation
✅ **User Experience**: Consistent, intuitive, well-documented
✅ **Scalability**: Architecture supports growth to thousands of tenants
✅ **Revenue**: Billing system enables monetization
✅ **Support**: Documentation & tools reduce churn
✅ **Insight**: Admin dashboard provides full visibility

The plan addresses all requirements mentioned:
- Multi-tenancy with role hierarchy ✓
- Reseller/sub-instance capabilities ✓
- Payment & quota system ✓
- Rate limiting ✓
- Complete documentation ✓
- SEO & marketing site ✓
- Super admin monitoring ✓
- Internal chat enhancements ✓
- Consistent UI/UX ✓
- Testing & reliability ✓

---

**Next Step**: Review this plan, prioritize which phase to start with, and begin implementation with Phase 1 improvements.

**Document Owner**: NextMavens Engineering Team
**Last Updated**: March 11, 2026
