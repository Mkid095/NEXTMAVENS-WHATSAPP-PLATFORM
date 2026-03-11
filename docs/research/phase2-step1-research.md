---
title: "Phase 2 Step 1 Research: Integrate Evolution API Message Status Webhooks"
date: 2026-03-11
status: COMPLETE
phase: 2
step: 1
---

# Research Summary: Evolution API Message Status Webhooks Integration

## Executive Summary

This research covers best practices for receiving and processing Evolution API WhatsApp message status webhooks in a Fastify/TypeScript/PostgreSQL environment with multi-tenancy enforced via RLS.

**Key Findings:**

1. **Evolution API Webhook Structure** - Well-documented event system with 20+ event types
2. **Security Imperative** - Signature verification is **required**, not optional
3. **Idempotency Critical** - Webhook retries can cause duplicate processing
4. **RLS Integration** - Must set `app.current_org` before processing to maintain tenant isolation
5. **Performance** - Async processing with message queue recommended for high volume

---

## 1. Evolution API Webhook System

### 1.1 Supported Events

From Evolution API documentation, the following webhook events are available:

| Event | Description | Typical Payload Fields |
|-------|-------------|----------------------|
| `APPLICATION_STARTUP` | API instance started | `instanceId`, `status` |
| `QRCODE_UPDATED` | QR code changed | `instanceId`, `qrcode`, `status` |
| `CONNECTION_UPDATE` | WhatsApp connection status | `instanceId`, `connection`, `status` |
| `MESSAGES_UPSERT` | New message received OR sent | `id`, `from`, `to`, `body`, `type`, `timestamp` |
| `MESSAGES_UPDATE` | Message status updated | `id`, `status` (sent, delivered, read, etc.) |
| `MESSAGES_DELETE` | Message deleted | `id`, `from`, `to` |
| `SEND_MESSAGE` | Confirmation of sent message | `messageId`, `status` |
| `CONTACTS_UPSERT` | Contact created/updated | `id`, `name`, `number` |
| `GROUPS_UPSERT` | Group created/updated | `id**, `subject`, `participants` |
| `PRESENCE_UPDATE` | User presence status | `id`, `presence` |
| ... and more | | |

**Most critical for message status tracking:** `MESSAGES_UPDATE` (delivered, read, failed, etc.)

### 1.2 Webhook Configuration in Evolution API

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://your-domain.com/api/webhooks/evolution",
    "headers": {},
    "byEvents": true,
    "base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "CONNECTION_UPDATE"
    ]
  }
}
```

**Important:**
- `byEvents: true` means only listed events trigger webhooks
- `base64: false` sends plain JSON (recommended)
- Webhook URL must be publicly accessible HTTPS (except for localhost dev)
- No authentication by default from Evolution API side

---

## 2. Security: Signature Verification

⚠️ **CRITICAL:** Evolution API does NOT sign webhooks by default. You must enable webhook secret in the admin panel or via API.

### 2.1 How Webhook Signatures Work

When you configure a webhook secret in Evolution API:

1. **Sender (Evolution):** Computes HMAC-SHA256 of raw request body using the shared secret
2. **Sender:** Includes signature in HTTP header: `X-Webhook-Signature: <hex_hmac>`
3. **Receiver (Your App):** Recomputes HMAC with the same secret
4. **Receiver:** Compares signatures using constant-time comparison
5. **If match:** Request is authentic
6. **If mismatch:** Reject with 401 (possible attack)

### 2.2 Implementation Example (Node.js crypto)

```typescript
import crypto from 'crypto';

interface WebhookHeaders {
  'x-webhook-signature'?: string;
  // other headers...
}

async function verifyWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Best Practices:**
- Use dedicated webhook secret (different from JWT_SECRET)
- Store secret in environment variable: `EVOLUTION_WEBHOOK_SECRET`
- Rotate secrets carefully (support both old and new during rotation)
- Use constant-time comparison to prevent timing attacks
- Reject unsigned webhooks if secret is configured

---

## 3. Idempotency & Duplicate Handling

### 3.1 The Duplicate Problem

Webhook providers retry failed deliveries (network errors, 5xx responses). Evolution API may also resend events. **Your handler must be idempotent** - processing the same webhook twice should not cause errors or data corruption.

### 3.2 Deduplication Strategies

**Strategy 1: Database Unique Constraints** (Recommended)
- Create unique index on `(instance_id, external_message_id)` for messages
- Use `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`
- Works automatically with Prisma `upsert()`

**Strategy 2: Processed Webhook Log**
- Store webhook event ID (if provided) or hash of payload
- Check before processing: `IF NOT EXISTS processed_webhooks SET ...`
- Tag processed webhooks with status and timestamp

**Strategy 3: In-Memory Cache (Redis)**
- Set key with TTL: `SETNX event:hash:abc123 1 EX 86400`
- Fast but requires Redis and loses data on restart
- Use as first-line defense before DB commit

### 3.3 Recommended Approach

For this platform, use **Strategy 1 (unique constraints)** because:

- Simpler - no additional infrastructure
- Persistent - survives restarts
- Prisma `upsert` handles it cleanly
- Database already has unique constraints on message `id`
- No race conditions with proper isolation

**Implement pattern:**

```typescript
await prisma.whatsAppMessage.upsert({
  where: { id: payload.messageId },
  create: { ... },
  update: { ... } // Update status if already exists
});
```

---

## 4. Fastify Webhook Handler Design

### 4.1 Schema Validation

Use JSON Schema for payload validation to reject malformed webhooks early.

```typescript
const webhookBodySchema = {
  type: 'object',
  required: ['event', 'instanceId'],
  properties: {
    event: {
      type: 'string',
      enum: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'CONNECTION_UPDATE'
      ]
    },
    instanceId: { type: 'string' },
    data: { type: 'object' } // Event-specific payload
  }
};

const routeSchema = {
  body: webhookBodySchema,
  // Optional: verify webhook comes from allowed IPs
  headers: {
    type: 'object',
    properties: {
      'x-webhook-signature': { type: 'string' }
    }
  }
};
```

### 4.2 Raw Body Access for Signature Verification

⚠️ **Important:** Fastify parses JSON body by default, which destroys raw bytes needed for signature verification.

**Solution:** Use `body: { raw: true, maxSize: 1024 * 1024 }` in route options to get raw body as Buffer:

```typescript
import { FastifyRequest } from 'fastify';

fastify.post(
  '/api/webhooks/evolution',
  {
    schema: {
      body: { ... }, // validation schema
    },
    // Get raw body as Buffer for signature verification
    rawBody: true
  },
  async (request, reply) => {
    const rawBody = request.rawBody as Buffer; // <-- This is the original bytes
    const jsonBody = request.body as WebhookPayload;

    // Verify signature first
    const signature = request.headers['x-webhook-signature'] as string;
    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    // Process webhook...
  }
);
```

### 4.3 Async Processing Pattern

Webhook processing should be fast (< 2s). For heavy operations:

1. **Receive** → Verify signature
2. **Acknowledge** → Return 200 OK immediately
3. **Queue** → Push to in-memory queue (Bull, Bee-Queue) or process in background

If queueing, use pattern:

```typescript
// In handler:
reply.code(200).send({ received: true });
// After reply is sent (fastify supports onPreReply)
// Or use fastify's defer pattern
```

But for simplicity and given the moderate expected volume, we can process synchronously as long as we optimize database operations.

---

## 5. Multi-Tenancy Integration

### 5.1 The Instance-Org Mapping Problem

**Challenge:** Evolution API webhooks provide `instanceId` (WhatsApp session), but our RLS requires `app.current_org` to be set. We need to map `instanceId` → `orgId`.

**Solution Flow:**

1. Look up `whatsapp_instances` table by `id = instanceId`
2. Get the `orgId` from the instance record
3. Set RLS: `SELECT set_config('app.current_org', orgId, false)`
4. Set role (use instance role or derived from org membership)
5. Now all queries automatically filter to that org

**Important:** Even though webhook is system-to-system (no user), we must still set RLS context to prevent cross-org data leaks.

### 5.2 Recommended Middleware: `webhookInstanceGuard`

Create a middleware specifically for Evolution webhooks:

```typescript
export async function webhookInstanceGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError) => void
) {
  const { instanceId } = request.body as { instanceId: string };
  if (!instanceId) {
    done(new FastifyError(400, 'Missing instanceId'));
    return;
  }

  // Find instance (must use prisma directly, bypassing RLS because we need to discover org)
  // Use SUPER_ADMIN role to bypass RLS for this lookup
  await prisma.$executeRaw`
    SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)
  `;

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, orgId: true }
  });

  if (!instance) {
    done(new FastifyError(404, `Instance ${instanceId} not found`));
    return;
  }

  // Now set RLS context to that instance's org for subsequent processing
  await prisma.$executeRaw`
    SELECT set_config('app.current_org', ${instance.orgId}, false)
  `;

  // Use system role for webhook processing (can read all org data now)
  await prisma.$executeRaw`
    SELECT set_config('app.current_user_role', 'SYSTEM', false)
  `;

  // Store on request for convenience
  (request as any).instance = instance;
  (request as any).orgId = instance.orgId;

  done();
}
```

**Note:** We need to add `SYSTEM` to the `Role` enum in Prisma schema.

---

## 6. Database Schema for Webhook Processing

### 6.1 Existing Tables to Update

Our Prisma schema already has:

- `WhatsAppInstance` - needs `connectionStatus`, `webhookUrl` fields (maybe)
- `WhatsappMessage` - already exists, stores message content and status
- `WhatsAppChat` - chat metadata
- `AuditLog` - for logging webhook processing events

### 6.2 New Table: `WebhookDeliveryLog`

Already exists in schema! Should be used to record:

```typescript
{
  id: string ( cuid )
  orgId: string
  instanceId: string
  event: string (MESSAGES_UPDATE, etc.)
  externalEventId?: string // if Evolution provides an ID
  payload: Json // full webhook payload
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'
  error?: string
  retryCount: number (default 0)
  nextRetryAt?: DateTime
  receivedAt: DateTime
  processedAt?: DateTime
}
```

**Purpose:**
- Audit trail of received webhooks
- Retry failed processing
- Debugging failed integrations
- Metrics and monitoring

---

## 7. Error Handling & Resilience

### 7.1 Webhook Processing Errors

Should **never** return 5xx to Evolution API. Instead:

```typescript
try {
  await processWebhook(payload);
  reply.code(200).send({ ok: true });
} catch (error) {
  // Log the error
  await auditLog(request, 'WEBHOOK_PROCESS_FAILED', { error: error.message });

  // Still return 200 if we logged the failure
  // Evolution will stop retrying on 2xx
  // If you want retries, return 5xx (but handle exponential backoff)
  reply.code(500).send({ error: 'Processing failed' });
}
```

### 7.2 Retry Strategies

If you need to retry (e.g., downstream service unavailable):

- **Use WebhookDeliveryLog** table to track retries
- **Exponential backoff:** retry after 1min, 5min, 30min, 2h
- **Circuit breaker:** stop processing if too many failures
- **Dead letter queue:** after max retries, flag for manual review

**Recommendation:** Since this is a high-volume system, make processing **idempotent** and return 200 always after acking to Evolution. Handle failures gracefully and continue. Use audit logs for investigation.

---

## 8. Rate Limiting & Security

### 8.1 Protection Against Webhook Flood

Evolution API is trusted (self-hosted), but still implement:

1. **IP Whitelist** (optional but recommended)
   - Allow only Evolution API server IPs
   - Check: `request.ip` or `request.headers['x-forwarded-for']`
   - Config: `ALLOWED_WEBHOOK_IPS` env var

2. **Rate Limiting**
   - Use `@fastify/rate-limit` plugin
   - Limit per IP: 100 req/min is reasonable
   - Important: Don't limit if IP is whitelisted

3. **Payload Size Limit**
   - Evolution webhook payloads are small (< 10KB typically)
   - Set `body: { maxSize: 1024 * 100 }` (100KB limit)

4. **Signature Verification** (already covered - must verify!)

---

## 9. Testing Strategy

### 9.1 Unit Tests

- **Signature verification function** - test valid, invalid, missing
- **Event parsers** - test each event type (MESSAGES_UPDATE, etc.)
- **Idempotency logic** - test upsert with same ID twice
- **Instance guard** - test org lookup, RLS context setting

### 9.2 Integration Tests

- **Full webhook handler** - simulate Evolution API POST with sample payloads
- **RLS validation** - ensure after guard, only instance's org data accessible
- **Database updates** - verify message status updates correctly

### 9.3 Sample Test Payload

```json
{
  "event": "MESSAGES_UPDATE",
  "instanceId": "instance_abc123",
  "data": {
    "id": "msg_xyz789",
    "status": "delivered",
    "timestamp": "2025-03-11T12:34:56.000Z"
  }
}
```

---

## 10. Implementation Plan (Step-by-Step)

Based on research, here's the recommended implementation order:

### Step 1: Core Library (`src/lib/integrate-evolution-api-message-status-webhooks/`)

**Files:**
- `index.ts` - Main entry: exports `processEvolutionWebhook(payload, options)`
- `types.ts` - TypeScript interfaces for all webhook events
- `signature.ts` - HMAC verification utility
- `parsers.ts` - Event-specific payload parsers (MESSAGES_UPDATE → status update)
- `validator.ts` - Zod/JSON Schema definitions

**Key Functions:**
- `verifyWebhookSignature(rawBody, signature, secret)`
- `handleMessageUpdate(instanceId, data)` → update message in DB
- `handleMessageUpsert(instanceId, data)` → create or update message
- `handleConnectionUpdate(instanceId, data)` → update instance status

### Step 2: API Route (`src/app/api/integrate-evolution-api-message-status-webhooks/`)

**File:** `route.ts`

- POST handler
- Raw body access
- Signature verification (calls lib)
- Instance guard (sets RLS context)
- Event dispatching to lib
- Returns 200/201
- Records to `WebhookDeliveryLog`

### Step 3: Testing & Validation

- Unit tests for all parsers
- Integration test with sample Evolution payloads
- End-to-end test verifying RLS enforcement
- Load test with 1000 webhooks to ensure performance

---

## 11. Key Libraries & Dependencies

Already available:
- `@prisma/client` - database access
- `fastify` - web framework

Need to add:
- **None** - We'll use Node.js built-in `crypto` for signature verification

Optional (future):
- `bull` or `bee-queue` - message queue for async processing
- `ioredis` - Redis for queue and caching
- `@fastify/rate-limit` - rate limiting webhook endpoint
- `pino` - structured logging (already via Fastify)

---

## 12. Open Questions & Decisions

### Q1: Should webhook endpoint be public or behind middleware?

**Decision:** Use dedicated route that does NOT require JWT auth (Evolution API is machine-to-machine). Instead, rely on IP whitelist + signature verification.

**Implementation:** Don't use `authMiddleware` or `orgGuard` on this route. Instead, use custom `webhookSignatureGuard` + `webhookInstanceGuard`.

### Q2: Where to store webhook secret?

**Decision:** Environment variable `EVOLUTION_WEBHOOK_SECRET`

```
# .env
EVOLUTION_WEBHOOK_SECRET=your-evolution-webhook-secret-here
```

### Q3: What to do with unverified webhooks?

**Decision:** Log to audit table, return 401, do NOT process. Monitor auth failures.

### Q4: How to handle Evolution API reconnects / duplicate webhooks?

**Decision:** Use upsert with unique constraints. Store external event ID if available.

### Q5: Should we add a `SYSTEM` role to the Role enum?

**Decision:** **YES**. This allows system processes (webhooks, scheduled jobs) to bypass normal user restrictions while still respecting RLS org context.

**Schema change:**

```prisma
enum Role {
  SUPER_ADMIN
  ORG_ADMIN
  MANAGER
  AGENT
  VIEWER
  API_USER
  SYSTEM // <-- Add this
}
```

---

## 13. Recommended File Structure

```
backend/src/
├── lib/
│   └── evolve-api-message-status-webhooks/
│       ├── index.ts           (main entry)
│       ├── types.ts           (interfaces)
│       ├── signature.ts       (verify signature)
│       ├── parsers.ts         (event parsers)
│       ├── handlers.ts        (business logic per event)
│       └── validator.ts       (JSON schemas)
│
├── routes/
│   └── webhooks/
│       └── evolution-api/
│           └── route.ts       (POST /api/webhooks/evolution)
│
├── middleware/
│   └── webhookGuard.ts        (instance lookup + RLS context)
│
└── test/
    └── webhook-evolution.integration.test.ts
```

---

## 14. References

1. Evolution API Webhooks Docs: https://doc.evolution-api.com/v2/en/configuration/webhooks
2. Evolution API GitHub: https://github.com/EvolutionAPI/evolution-api
3. Fastify Validation: https://www.fastify.io/docs/latest/Validation-and-Serialization/
4. Webhook Security Best Practices: https://www.webhookdebugger.com/blog/webhook-security-best-practices
5. PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

## 15. Validation Checklist (from phase2.json)

- [x] Research conducted using Context7 + Brave Search
- [x] Webhook structure documented
- [x] Security best practices identified (signature verification mandatory)
- [x] Idempotency strategy defined (upsert with unique constraints)
- [x] Multi-tenancy integration plan (instance → org mapping)
- [x] Error handling pattern established
- [x] File structure planned
- [x] Database schema implications addressed (need SYSTEM role)
- [x] Testing strategy outlined

---

**Next:** Create git branch and begin implementation of `src/lib/integrate-evolution-api-message-status-webhooks/index.ts`
