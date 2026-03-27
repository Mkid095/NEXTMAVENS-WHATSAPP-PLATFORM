# WhatsApp MVP Completion - Design Document

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Production-ready MVP with Phases 1-2 fully functional

---

## Overview

The NextMavens WhatsApp Platform is a multi-tenant WhatsApp messaging API built on top of the Evolution API gateway. The system is 80% complete with Phases 1-2 implemented but not fully verified. This design outlines the minimal work needed to achieve a production-ready state without taking on the full 8-phase roadmap (~600 hours).

---

## Current State Assessment

✅ **Completed:**
- Backend server (Fastify, TypeScript) running on port 4930 via systemd
- Database schema with Prisma (PostgreSQL)
- Core Phase 1-2 modules in `src/lib/`:
  - Rate limiting (Redis)
  - Quota enforcement
  - Idempotency keys
  - 2FA enforcement
  - Audit logging
  - Health checks
  - Instance heartbeat monitoring
  - Message retry & DLQ (configurable)
  - BullMQ workflow orchestration
  - Feature flags
  - Comprehensive metrics (Prometheus)
- Evolution API container (Docker) deployed
- Nginx frontend with HTTPS (api.nextmavens.cloud, private.nextmavens.cloud)
- Systemd services configured for auto-restart
- Daily database backups verified
- Basic security hardening (SSH keys, fail2ban, headers)

⚠️ **Issues:**
- Nginx routing → port 3002 (wrong, backend on 4930)
- Evolution API unhealthy, no WhatsApp instances created
- Backend Phase 3 billing routes commented out (TypeScript errors)
- Webhook routing may be misconfigured
- No end-to-end message test completed

---

## Proposed Architecture (Production-Ready MVP)

```
┌─────────────┐    HTTPS    ┌─────────────┐    HTTP    ┌──────────────────┐    WhatsApp    ┌─────────────┐
│  Client/    │────────────▶│   Nginx      │───────────▶│  Backend API     │──────────────▶│  Evolution   │
│  Web App    │             │ (443)        │ (4930)     │  (Fastify)       │   (3001)      │  API        │
└─────────────┘             └─────────────┘           └──────────────────┘                └─────────────┘
                                                             │
                                                             ▼
                                                    ┌──────────────────┐
                                                    │   PostgreSQL     │
                                                    │   + Prisma       │
                                                    └──────────────────┘
                                                             │
                                                             ▼
                                                    ┌──────────────────┐
                                                    │   Redis +        │
                                                    │   BullMQ         │
                                                    └──────────────────┘
```

**Data Flow:**
1. Client sends message via `POST /api/v1/whatsapp/send` (authenticated with API key)
2. Backend validates tenant quota, applies rate limit, generates idempotency key
3. Message enqueued to BullMQ priority queue
4. Worker picks message, calls Evolution API `POST /message/sendText`
5. Evolution API sends to WhatsApp cloud, receives webhook (status updates)
6. Evolution POSTs to backend `POST /api/v1/whatsapp/webhook` (signature verified)
7. Backend updates message status, notifies via Socket.IO (if connected)

---

## Design Decisions

### 1. Minimal Viable Scope

**What we'll deliver:**
- ✅ Working HTTPS API endpoint to send WhatsApp messages
- ✅ Webhook receiver for inbound messages and status updates
- ✅ Instance management (list, connect, disconnect)
- ✅ Security: Auth, rate limiting, quotas, audit logs
- ✅ Reliability: Message retry with DLQ, idempotency
- ✅ Monitoring: Metrics exposed to Prometheus, Grafana alerts
- ✅ Infrastructure: Nginx routing, SSL, systemd auto-restart
- ✅ Documentation: System status, Phase 3-8 roadmaps

**What we'll defer:**
- ❌ Phase 3: Billing system (Stripe, invoices, coupons, tax) - can be added later as subscription layer
- ❌ Phase 4: Developer portal & SDK generation - nice-to-have, not needed for MVP
- ❌ Phase 5: Admin dashboard - can use Grafana + direct DB queries temporarily
- ❌ Phase 6: Comprehensive test suite - will be added after features stabilize
- ❌ Phase 7: Advanced UX (WebSocket reactions, AI, analytics, dark mode) - future iteration
- ❌ Phase 8: Full Terraform/CI/CD - current manual deployment works for single-VPS

**Rationale:** The platform is a business product. Getting a working messaging API in customers' hands validates the core hypothesis. Billing can be added as a separate project once there's demand. Testing and deployment automation are quality-of-life improvements for scaling.

---

### 2. Evolution API Integration

Evolution API v1.8.2 is already configured with file-based persistence. We'll use a single WhatsApp instance named "main" for the MVP.

**Connection Flow:**
1. Create instance via `POST /instance/create/main` (no token initially)
2. Get QR code from `GET /instance/connect/main`
3. Scan QR with a WhatsApp device (the business phone)
4. Poll `GET /instance/fetchInstances` until `connectionStatus: "open"`
5. Webhook URL will be: `https://api.nextmavens.cloud/api/v1/whatsapp/webhook`
6. Webhook secret stored in `.env` as `EVOLUTION_WEBHOOK_SECRET`

**Multiple instances** will be supported later for multi-tenancy (each tenant gets own Evolution instance).

---

### 3. Multi-Tenancy Model

**Current approach:** Database already has `tenants` table. Each API key maps to a tenant. All data scoped by `tenantId`.

**For MVP:** We'll create a single "default" tenant and use its API key for testing. Multi-tenant isolation (separate Evolution instances per tenant) is Phase 4 work.

**Tenant data isolation:**
- Messages: `tenantId` foreign key
- API keys: scoped to tenant
- Rate limits: per-tenant
- Quotas: per-tenant
- Audit logs: per-tenant

---

### 4. Error Handling & Observability

**Already implemented:**
- `try/catch` in route handlers with proper Fastify replies
- Idempotency cache (Redis) - prevents duplicate message sends
- BullMQ retry logic with exponential backoff and DLQ
- Prometheus metrics: `whatsapp_messages_sent_total`, `whatsapp_messages_failed_total`, `http_requests_total`, etc.
- Health endpoint with memory/uptime/Redis check

**Areas to verify:**
- DLQ dead letter handling (manual inspection needed)
- Redis connection loss handling (fail open?)
- Evolution API timeout handling (5s default?)

---

### 5. Security Model

**Already in place:**
- HTTPS (Let's Encrypt via Nginx)
- JWT authentication for API routes
- API key validation middleware
- 2FA requirement for admin roles
- Rate limiting per IP + per API key
- Quota enforcement per tenant (messages/day)
- Security headers (HSTS, CSP, X-Frame-Options, etc.)
- Server tokens hidden (`server_tokens off;`)

**Considerations:**
- API key rotation mechanism (Phase 3 or 4)
- Tenant isolation verification (SQL row-level security? - Prisma doesn't support natively, rely on query filters)
- Webhook signature verification (HMAC-SHA256) using `EVOLUTION_WEBHOOK_SECRET`
- CORS configuration (restricted to trusted origins)

---

### 6. Monitoring & Alerting

**Grafana dashboards** provisioned via docker-compose should include:
- System metrics: CPU, memory, disk, network
- Application metrics: request rate, error rate, latency (p95, p99)
- Queue depth (BullMQ)
- Message delivery success rate
- API usage per tenant

**Alert rules** (thresholds):
- CPU > 80% for 5m
- Memory > 85% for 5m
- Disk < 10% free
- Backend down (HTTP 5xx on /health)
- Redis down
- PostgreSQL connection errors
- Message rate spikes (possible abuse)

**Note:** Grafana is running but we need to verify dashboards are provisioned correctly.

---

## Implementation Tasks (High-Level)

1. **Nginx routing fix** - 10 min
2. **Backend health verification** - 30 min
3. **Evolution API health** - 30 min (may need permission fixes, restart)
4. **WhatsApp instance creation** - 1 hour (scan QR manually)
5. **End-to-end message test** - 30 min
6. **Phase 3 error analysis & documentation** - 2 hours
7. **Phases 4-8 roadmap docs** - 2 hours
8. **System status summary** - 1 hour

**Total:** ~8 hours of focused work

---

## Testing & Validation Criteria

**MVP is complete when:**

✅ Nginx routes `api.nextmavens.cloud` → backend:4930
✅ Backend `/health` returns 200 JSON
✅ Evolution API is healthy and shows `connectionStatus: "open"`
✅ Can send a WhatsApp message via API and receive it on phone
✅ Can receive a WhatsApp message and see webhook logged
✅ Prometheus metrics endpoint `/metrics` returns data
✅ Grafana dashboard displays system metrics
✅ All Phase 3 errors documented with fix plan
✅ System status document signed off
✅ Git tag `v0.9.0-mvp-complete` pushed

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Evolution API unstable | Can't send messages | Check logs, rebuild container, verify WhatsApp account not banned |
| WhatsApp QR code expires | Blocking | Re-generate QR, instance stays in `connecting` until scanned |
| PostgreSQL connection limits | Timeouts | Increase `connection_limit` in DATABASE_URL, use connection pooling |
| Redis memory pressure | Queue failures | Monitor memory usage, add eviction policy, scale vertically |
| API key exposed in logs | Security incident | Ensure logs filter sensitive headers, rotate key if leaked |
| Nginx misconfiguration | Outage | Test config with `nginx -t`, use backup files, have rollback plan |

---

## Success Metrics

- **Message delivery rate:** >99% within 30 seconds
- **API latency:** p95 < 500ms, p99 < 1s
- **Uptime:** 99.9% (systemd auto-restart covers crashes)
- **Backup retention:** 7 days with successful restore tested

---

## Next Steps After MVP

1. **Phase 3 (Billing):** Implement Stripe subscriptions, usage metering, invoices
2. **Phase 4 (API Portal):** Swagger docs, API key management UI for tenants
3. **Phase 5 (Admin Dashboard):** Revenue and usage metrics for super admin
4. **Phase 6 (Testing):** Unit tests, integration tests, load tests
5. **Phase 7 (Advanced):** Socket.IO real-time updates, AI features
6. **Phase 8 (Production):** Terraform IaC, CI/CD, SOC2, multi-region DR

---

## Appendix: Configuration Reference

**Backend .env** (`backend/.env`):
```
DATABASE_URL=postgresql://nextmavens_app:app_secure_password_2026@localhost:5432/nextmavens_research
JWT_SECRET=<strong-random-64bytes>
REDIS_URL=redis://localhost:6379
EVOLUTION_API_URL=http://localhost:3001
EVOLUTION_API_KEY=<from-evolution-compose>
EVOLUTION_WEBHOOK_SECRET=<random-hmac-secret>
PORT=4930
NODE_ENV=production
```

**Evolution API** (`evolution-api/docker-compose.yml`):
- Port 3001 → 8080
- Volume: `./store:/evolution/store`
- Env: `CACHE_REDIS=redis://host.docker.internal:6379` (adjust for container network)
- Health check on `http://localhost:8080/health`

**Nginx** (`/etc/nginx/sites-available/api.nextmavens.cloud`):
- SSL cert: `/etc/letsencrypt/live/api.nextmavens.cloud/`
- Proxy to `http://127.0.0.1:4930`
- Security headers + rate limiting
