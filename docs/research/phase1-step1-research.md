# Phase 1, Step 1 Research: PostgreSQL RLS for Multi-Tenancy

**Date**: 2026-03-11
**Step**: Enable PostgreSQL RLS on All Tenant Tables
**Risk Level**: CRITICAL
**Researcher**: (Your name)

---

## 1. PostgreSQL RLS Fundamentals

### What is Row Level Security (RLS)?

Row Level Security (RLS) is a PostgreSQL feature that restricts which rows a user can access or modify in a table based on their role or attributes. When RLS is enabled on a table, all normal access is blocked and access is controlled entirely by policies.

**Key Concepts**:
- **RLS Policy**: A rule that evaluates to true/false for each row
- **USING clause**: Determines which rows are SELECT/UPDATE/DELETE accessible
- **WITH CHECK clause**: Determines which rows can be INSERTed
- **Session variable**: Can set `app.current_org` per connection for multi-tenancy

### Why RLS is CRITICAL for Multi-Tenant SaaS

**Defense in Depth**:
1. Application middleware (orgGuard) filters by orgId
2. **RLS as fail-safe**: If middleware has a bug, database still enforces isolation
3. Cannot bypass even if attacker gains direct DB access

**Example Attack Without RLS**:
```typescript
// Middleware bug: forgot to filter by orgId
const messages = await prisma.whatsappMessages.findMany(); // BUG: returns ALL orgs' messages!
```

**With RLS**:
```sql
-- Even if query forgets WHERE orgId = X, RLS adds the filter automatically
CREATE POLICY tenant_isolation_messages ON whatsapp_messages
USING (org_id = current_setting('app.current_org')::uuid);
```

---

## 2. Tables Requiring RLS (From Comprehensive Plan)

All tables that contain tenant-specific data need RLS:

### Tenant Tables (Direct org ownership)
1. `organizations` - orgs themselves
2. `members` - org membership linking users to orgs
3. `whatsapp_instances` - WhatsApp numbers per org
4. `whatsapp_messages` - messages per org
5. `whatsapp_chats` - chats per org
6. `whatsapp_templates` - templates per org
7. `whatsapp_agents` - agents per org
8. `whatsapp_assignments` - chat assignments per org
9. `webhook_subscriptions` - webhooks per org
10. `webhook_delivery_logs` - webhook deliveries per org
11. `quota_usages` - quota tracking per org

### Potential Tables (If They Exist)
- `reseller_sub_instances` - sub-orgs under reseller
- `billing_invoices` - invoices per org
- `payment_methods` - payment methods per org
- `coupons_redemptions` - coupon usage per org

**Rule of thumb**: If table has `orgId` column → needs RLS.

---

## 3. RLS Policy Implementation Pattern

### Step 1: Enable RLS on Table
```sql
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
```

### Step 2: Create Policy
```sql
CREATE POLICY tenant_isolation_policy_name
ON table_name
USING (org_id = current_setting('app.current_org')::uuid);
```

**Using `current_setting('app.current_org')`**:
- We set this session variable after user authenticates
- Value = user's orgId
- Automatically applies to all queries in that session
- Type-safe: cast to `::uuid` to match orgId type

### Step 3: (Optional) WITH CHECK for INSERTs
```sql
CREATE POLICY tenant_insert_policy
ON table_name
WITH CHECK (org_id = current_setting('app.current_org')::uuid);
```

**Why separate?**: `USING` controls SELECT/UPDATE/DELETE. `WITH CHECK` controls INSERT/UPDATE of the orgId column itself.

---

## 4. Fastify Middleware Pattern

After authenticating user, set the session variable:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PristaClient();

async function orgGuard(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user; // from JWT

  // SUPER_ADMIN bypasses RLS (can see all orgs)
  if (user.role === 'SUPER_ADMIN') {
    return;
  }

  // Verify user is member of org
  const member = await prisma.member.findFirst({
    where: {
      userId: user.id,
      orgId: req.params.orgId || user.orgId,
    },
  });

  if (!member) {
    throw new FastifyError(403, 'Access denied: not a member');
  }

  // Set RLS context for this database session
  await prisma.$executeRaw`
    SET app.current_org = ${member.orgId}
  `;

  // Store orgId on request for later use
  req.currentOrgId = member.orgId;
}

// Apply to all protected routes
preValidationHook: [authMiddleware, orgGuard]
```

**Critical**: The `SET app.current_org` must execute in the same database session as subsequent queries. Prisma maintains session per connection, so this works.

---

## 5. Testing RLS Effectiveness

### Test 1: Verify RLS is Enabled
```sql
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('whatsapp_messages', 'organizations', ...');
-- Should return 't' for all tenant tables
```

### Test 2: Attempt Cross-Tenant Access (Should Fail)
```typescript
// Setup: Org A user authenticates → orgId = 'org-a-uuid'
// Attempt to access Org B's data:
const messages = await prisma.whatsappMessages.findMany();
// Should only return messages where org_id = 'org-a-uuid'
// If returns Org B messages → RLS not working!
```

### Test 3: SUPER_ADMIN Can Bypass
```typescript
// SUPER_ADMIN should see all orgs
// Solution: For SUPER_ADMIN, either:
// a) Don't set RLS context (SET app.current_org = NULL)
// b) Set RLS bypass policy: USING (true)
```

**Implementation for SUPER_ADMIN**:
```sql
-- Admin bypass policy (allows all rows)
CREATE POLICY admin_bypass ON organizations
USING (true);  -- Super admin sees all orgs

-- Regular user policy
CREATE POLICY tenant_isolation ON organizations
USING (org_id = current_setting('app.current_org')::uuid);
```

---

## 6. Database Migration Strategy

Using Prisma migrations:

### Migration File Structure
```sql
-- prisma/migrations/20250311_add_rls_policies/migration.sql

-- 1. Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- ... repeat for all 11 tables

-- 2. Create SUPER_ADMIN bypass policies
CREATE POLICY admin_bypass_organizations ON organizations USING (true);
-- ... for all tables

-- 3. Create tenant isolation policies
CREATE POLICY tenant_isolation_organizations ON organizations
USING (org_id = current_setting('app.current_org')::uuid);
-- ... for all tables

-- 4. Grant policy usage to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO app_user;
-- ... repeat for all tables
```

**Important**: Apply to **ALL** tables with `orgId` column. Missing one = security hole.

---

## 7. Common Pitfalls & Solutions

### Pitfall 1: Forgetting to Set RLS Context
**Symptom**: User sees no data (RLS filters everything)
**Cause**: Middleware didn't execute `SET app.current_org`
**Fix**: Ensure orgGuard runs **before** every database query

### Pitfall 2: Prisma Connection Pooling
**Symptom**: RLS context "leaks" between requests
**Cause**: Prisma reuses connections; session variable persists
**Fix**: Always `SET app.current_org` at start of each request (not just first)

### Pitfall 3: SUPER_ADMIN Seeing Only One Org
**Symptom**: Admin can't see all orgs
**Cause**: RLS policy restricts even admins
**Fix**: Create `admin_bypass` policy with `USING (true)` that takes precedence

### Pitfall 4: INSERTs Without orgId
**Symptom**: "Column orgId cannot be null" error
**Cause**: `WITH CHECK` policy requires orgId match
**Fix**: Always include orgId in INSERT (Prisma handles if value present)

### Pitfall 5: Background Workers Bypassing RLS
**Symptom**: BullMQ worker sends messages without org context
**Cause**: Job processor doesn't set RLS context
**Fix**: In worker, fetch orgId from job data, then `SET app.current_org`

---

## 8. Questions to Answer Before Implementation

1. **What is the exact list of tables with orgId?**
   - Need to extract from existing Prisma schema or database

2. **How is authentication currently structured?**
   - Need to see how `req.user` is populated
   - Need to understand orgId source (user's primary org? from membership?)

3. **PostgreSQL connection details?**
   - Host: `nextmavens-research-db` (from Docker)
   - Port: 5433
   - Database name: ?
   - Credentials: ?

4. **Do we have existing Prisma setup?**
   - Current package.json shows `better-sqlite3`, not Prisma
   - Need to install Prisma, initialize, define schema

5. **What is the orgId column type?**
   - Likely `UUID` or `CUID` string
   - Need to ensure `current_setting('app.current_org')` casts correctly

---

## 9. Sources Consulted (MANDATORY)

Use Context7 MCP to research:
- PostgreSQL RLS documentation (official)
- Prisma documentation on raw queries and connection management
- Fastify middleware patterns
- Multi-tenancy patterns (Rails Basecamp approach, Django tenant schemas)

Use Brave Search for:
- "PostgreSQL RLS multi-tenant best practices"
- "Prisma raw query SET session variable"
- "Fastify preValidation hook example"
- "RLS policy performance overhead"

---

## 10. Implementation Checklist

- [ ] Verify PostgreSQL connection details (host, port, db, user, password)
- [ ] Install Prisma: `npm install prisma @prisma/client --save-dev`
- [ ] Create `backend/prisma/schema.prisma` with all tenant models
- [ ] Generate initial migration: `npx prisma migrate dev --name init`
- [ ] Create second migration: `npx prisma migrate dev --name add_rls_policies`
- [ ] Write SQL for RLS enable + policies (11 tables)
- [ ] Create Fastify middleware `orgGuard` in `backend/src/middleware/orgGuard.ts`
- [ ] Integrate middleware into all protected routes
- [ ] Write integration tests for:
  - [ ] User can only see own org's data
  - [ ] Cross-org access blocked
  - [ ] SUPER_ADMIN can see all orgs
- [ ] Test migration on development database first
- [ ] Document rollback procedure (DROP POLICIES, DISABLE RLS)
- [ ] PR review: Ensure ALL tables with orgId have RLS

---

## 11. Validation Steps

After implementation:

1. **Schema validation**: `npx prisma validate`
2. **Migration check**: `npx prisma migrate diff` shows only expected changes
3. **Test suite**: `npm run test` (all tests pass)
4. **Manual test**:
   - Login as Org A user
   - Query `/api/v1/messages` → only Org A messages
   - Attempt to access Org B instance ID → 403 or filtered
5. **SQL verification**:
   ```sql
   \l+ whatsapp_messages -- confirm "Row Security" = "on"
   \dp whatsapp_messages -- list policies, confirm 2 policies (admin_bypass + tenant_isolation)
   ```

---

## 📚 Key References

1. PostgreSQL RLS Docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
2. Prisma Migrations: https://www.prisma.io/docs/concepts/components/prisma-migrate
3. Multi-tenancy patterns: https://www.postgresql.org/docs/current/ddl-rowsecurity.html#DDL-ROW-SECURITY-POLICIES
4. Fastify hooks: https://www.fastify.io/docs/latest/Server/#prevalidationhook

---

**Next**: After this research document, create:
1. Branch: `git checkout -b phase1-step-1-enable-rls`
2. Implementation: Create Prisma schema with all models
3. Migration: SQL for RLS policies
4. Middleware: `orgGuard` implementation
5. Tests: Integration tests verifying isolation
6. Document decisions, challenges, metrics in final report

EOF
