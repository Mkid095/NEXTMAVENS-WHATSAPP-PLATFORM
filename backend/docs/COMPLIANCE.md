# Compliance Checklist

**NEXTMAVENS WhatsApp Platform - Phase 1 Security & Compliance**

This document outlines the compliance status for key standards including SOC 2 Type II, GDPR, and general security best practices.

---

## Overview

The platform is designed with security-first principles: multi-tenancy with Row Level Security (RLS), immutable audit logging, mandatory 2FA for privileged roles, and comprehensive rate limiting.

**Compliance Maturity**: Phase 1 achieves **Foundation** level. Some items require additional configuration or third-party services for full compliance (e.g., encryption at rest, automated backups).

---

## SOC 2 Type II Trust Services Criteria

| Criteria | Control | Status | Implementation Details |
|----------|---------|--------|------------------------|
| **Security** | Access controls (authentication & authorization) | ✅ COMPLIANT | JWT-based authentication, RBAC (6 roles), 2FA enforcement for SUPER_ADMIN/ORG_ADMIN via middleware. |
| | Network & system monitoring | ✅ COMPLIANT | Health checks (`/health`), Redis-based rate limiting, BullMQ error tracking, structured logging. |
| | Vulnerability management | ⚠️ PARTIAL | `npm audit` available; integrate into CI/CD. Recommend Snyk or Dependabot. |
| | Change management | ✅ COMPLIANT | Git-based workflow with PR reviews; all changes tracked. |
| **Availability** | Disaster recovery | ⚠️ PARTIAL | Database backups scripted but not automated. Recommend daily automated backups with retention policy (30 days). |
| | Performance monitoring | ✅ COMPLIANT | Health checks uptime, BullMQ queue metrics, rate limit metrics, Redis memory tracking. |
| | Incident response | ⚠️ IN PROGRESS | Runbook documentation recommended. Alerting not implemented (use Grafana/PagerDuty). |
| **Processing Integrity** | Input validation | ✅ COMPLIANT | Zod schemas used for manual validation on all inputs; type safety via TypeScript. |
| | Output validation | ✅ COMPLIANT | Consistent JSON response format; HTTP status codes accurately reflect outcome. |
| | Error handling | ✅ COMPLIANT | Central error handler; errors logged; graceful degradation (fail open for quota middleware). |
| | Data integrity | ✅ COMPLIANT | Prisma ORM with relational constraints; BullMQ ensures at-least-once delivery; DLQ captures failures. |
| **Confidentiality** | Encryption in transit | ✅ COMPLIANT | TLS termination expected at load balancer; Helmet sets security headers; CORS configured. Database connections should use SSL (enable `sslmode=require`). |
| | Encryption at rest | ❌ NOT COMPLIANT | PostgreSQL data stored in plaintext. **Action**: Enable PostgreSQL TDE or application-level encryption for sensitive fields. |
| | Secret management | ⚠️ PARTIAL | JWT secret stored in `.env`; should use KMS in production (AWS Secrets Manager, Vault). |
| **Privacy** | Data minimization | ✅ COMPLIANT | Only necessary data stored (phone numbers, message content). No unnecessary PII collected. |
| | User consent | ⚠️ PARTIAL | Implicit consent assumed. Add explicit consent for marketing messages and data processing (GDPR Art. 6/7). |
| | Right to erasure | ⚠️ NOT IMPLEMENTED | No endpoint to delete user data. Must implement data purging workflow (soft delete + hard delete options). |
| | Data portability | ⚠️ NOT IMPLEMENTED | No export endpoint. Add `/api/user/export` to download user data in JSON/CSV format. |
| | Breach notification | ❌ NOT IMPLIEMENTED | No automated breach detection. Integrate monitoring and define 72h notification process. |

---

## GDPR Compliance

| Requirement | Status | Evidence / Implementation |
|-------------|--------|---------------------------|
| **Lawful basis for processing** | ⚠️ PARTIAL | Legitimate interest for service delivery; consent for marketing needs explicit capture. |
| **Data subject rights** | ⚠️ IN PROGRESS | - Access: via API queries<br>- Rectification: admin UI (TODO)<br>- Erasure: not implemented (TODO)<br>- Portability: not implemented (TODO)<br>- Restrict processing: not implemented (TODO) |
| **Privacy by design** | ✅ COMPLIANT | RLS enforces data isolation; minimal data collection; audit logs track access. |
| **Data Protection Impact Assessments (DPIA)** | ❌ NOT STARTED | Required for high-risk processing. Conduct DPIAs before processing large-scale sensitive data. |
| **Data breaches** | ❌ NOT PREPARED | No detection/notification process. Define incident response plan and notify supervisory authority within 72h. |
| **International transfers** | ⚠️ CONTEXTUAL | If using EU-hosted DB, fine. If transferring outside EEA, need Standard Contractual Clauses (SCC) or adequacy decision. |
| **Data retention** | ⚠️ NOT DEFINED | Audit logs retained indefinitely by default. Define retention policy (e.g., keep logs 7 years for financial, 3 years for others). Implement automatic pruning. |

---

## Data Security Controls

### Encryption

| Data at Rest | Status | Notes |
|--------------|--------|-------|
| PostgreSQL database | ❌ Unencrypted | Enable filesystem encryption or use cloud provider's encrypted storage (RDS, CloudSQL). |
| Redis persistence | ⚠️ Unencrypted (if enabled) | Enable `redis.conf` `tls-ports` and use disk encryption. |
| Backups | ❌ Unencrypted | Ensure backup files are encrypted (pg_dump with gpg; S3 SSE). |
| 2FA secrets (mfaSecret) | ⚠️ Plaintext in DB | Encrypt using application-level key derived from `JWT_SECRET` or KMS. |

### Encryption in Transit

| Channel | Status | Notes |
|---------|--------|-------|
| Client ↔ Load Balancer | ⚠️ TLS required | Must enable HTTPS in production. Use TLS 1.2+; configure strong ciphers. |
| Load Balancer ↔ App | ⚠️ Depends on config | Ideally use internal TLS (mTLS) in zero-trust networks. |
| App ↔ PostgreSQL | ⚠️ SSL recommended | Set `sslmode=require` in `DATABASE_URL`. |
| App ↔ Redis | ⚠️ TLS optional | Redis 6+ supports TLS. Use `rediss://` URL if enabled. |

---

## Access Control & Authentication

### JWT Tokens

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Expiration**: 1 hour (`expiresIn: '1h'`)
- **Refresh**: Not implemented (TODO: implement refresh token rotation)
- **Storage**: Client-side storage strategy should prevent XSS theft (HttpOnly cookies recommended, localStorage vulnerable to XSS)

### Role-Based Access Control (RBAC)

| Role | Permissions | 2FA Required |
|------|-------------|--------------|
| SUPER_ADMIN | Full access, can manage all orgs | ✅ |
| ORG_ADMIN | Full access within their org | ✅ |
| MANAGER | Can manage instances, view messages | ❌ |
| AGENT | Can send messages, view chats | ❌ |
| VIEWER | Read-only access | ❌ |
| API_USER | API key-based access (future) | ❌ |

2FA enforcement is global in `server.ts` preHandler; `/admin/2fa/*` endpoints exempt to allow enrollment.

---

## Audit Logging

The `AuditLog` table provides an **immutable** record of significant actions:

- `userId`, `action`, `resource`, `resourceId`, `createdAt`
- `changes` JSON stores before/after snapshots
- `orgId` scoping (NULL for SUPER_ADMIN)

**Best Practice**: Ensure all admin actions call `createAuditLog()` (from Step 9 library). Currently manual invocation required. Consider adding decorator or middleware to auto-audit CRUD operations on sensitive models.

---

## Rate Limiting & Quotas

- **Global Default**: 100 req/min (configurable)
- **Per-org overrides**: Supported via admin API
- **Quota metrics**: API calls tracked hourly/daily/monthly
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-Quota-Limit`, `X-Quota-Remaining` returned on responses

Logs rate limit violations at `warn` level—useful for detecting abuse.

---

## Third-Party Integrations

### Evolution API

- Webhook signature verification should be implemented using HMAC-SHA256.
- Ensure `X-Api-Key` and signature headers are validated with constant-time comparison to prevent timing attacks.
- Verify the webhook route `integrate-evolution-api-message-status-webhooks/route.ts` has signature check enabled.

### Stripe (Phase 3, not yet implemented)

- Will require TLS 1.2+
- Webhook endpoint must verify signature using Stripe's `stripe.webhooks.construct_event`

---

## Testing & Quality Assurance

### Current Test Coverage

- **Unit Tests**: ~100+ tests (Jest)
- **Integration Tests**: Mocked Fastify tests + real DB tests (need test DB)
- **E2E Tests**: None yet (Cypress/Playwright planned for Phase 6)

### Recommended Security Tests

1. **Static Analysis** (SAST):
   ```bash
   npm audit
   npx snyk test
   # Integrate into CI/CD
   ```

2. **Dynamic Analysis** (DAST):
   - OWASP ZAP baseline scan against staging
   - Nikto web server scanner

3. **Penetration Testing**:
   - Schedule quarterly security audits
   - Focus areas: authentication bypass, RLS bypass, injection, XSS in any frontend, SSRF in webhooks

4. **Dependency Scanning**:
   - Enable Dependabot alerts on GitHub
   - Use `npm audit` in CI pipeline, fail builds on high/critical

---

## Compliance Gaps & Action Plan

| Gap | Priority | Action | Estimated Effort |
|-----|----------|--------|------------------|
| 1. Encryption at rest (DB, Redis, backups) | CRITICAL | Enable PostgreSQL TDE or host-level encryption; encrypt Redis AOF/RDB; implement backup encryption. | 8 hours |
| 2. 2FA secret encryption | HIGH | Modify User model to store encrypted `mfaSecret` using Node `crypto` and master key from env/KMS. | 4 hours |
| 3. GDPR right to erasure | HIGH | Build admin endpoint to permanently delete user and related data (audit logs may need anonymization). | 1 day |
| 4. GDPR data portability | MEDIUM | Add `/api/user/export` endpoint returning JSON with all user data. | 1 day |
| 5. Automated backups | HIGH | Implement daily cron jobs for PostgreSQL (`pg_dump`) and Redis, upload to S3/object storage with encryption. | 4 hours |
| 6. Backup restoration testing | HIGH | Test restore procedure monthly; document runbook. | 2 hours monthly |
| 7. Breach detection & notification | HIGH | Integrate SIEM or guardrails (e.g., AWS GuardDuty, Azure Defender). Create incident response playbook. | 2 days |
| 8. Dependency vulnerability scanning | HIGH | Integrate Snyk or Dependabot; block merges on critical vulnerabilities. | 2 hours |
| 9. Penetration testing | HIGH | Engage external security firm or internal red team for full assessment. | 3-5 days |
| 10. DPIA documentation | MEDIUM | Write Data Protection Impact Assessment for processing activities. | 1 day |

---

## Monitoring & Logging

### Structured Logging

Fastify uses Pino logger. Logs include:

```json
{
  "level": 30,
  "time": "2025-03-14T10:30:00.123Z",
  "pid": 123,
  "hostname": "app-1",
  "req": {
    "id": "req-123",
    "method": "POST",
    "url": "/admin/2fa/verify",
    "headers": { ... }
  }
}
```

Forward logs to centralized system (Loki, Papertrail, CloudWatch Logs).

---

## Incident Response Runbook (Recommendation)

Create a Confluence or Markdown runbook with:

1. **Detection**: How to identify incidents (monitoring alerts, log patterns)
2. **Containment**: Steps to isolate affected systems (e.g., revoke JWT secret, rotate DB passwords)
3. **Eradication**: Remove malicious access, patch vulnerabilities
4. **Recovery**: Restore from clean backups, verify integrity
5. **Post-Mortem**: Root cause analysis, lessons learned, action items

---

## Conclusion

Phase 1 provides a **secure, auditable, multi-tenant foundation** with strong controls for authentication, authorization, and data isolation. To achieve full SOC 2 Type II and GDPR compliance, the action items above must be completed, particularly **encryption at rest**, **breach response planning**, and **data subject rights workflows**.

**Next Steps**:
- Implement the compliance gaps marked CRITICAL/HIGH before production launch.
- Establish automated backup and restore testing.
- Integrate security scanning into CI/CD pipeline.
- Schedule penetration test pre-launch.

---

**Last Reviewed**: 2026-03-14
**Owner**: Security Team / Engineering Lead

EOF
