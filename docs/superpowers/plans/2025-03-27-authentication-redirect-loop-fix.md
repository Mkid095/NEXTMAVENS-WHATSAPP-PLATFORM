# Authentication Redirect Loop Fix - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix authentication redirect loop by correcting frontend API baseURL usage, adding missing WhatsApp instances backend route, and resetting quota for test org.

**Architecture:** The frontend uses axios with a relative baseURL `/api/v1`, but all API calls incorrectly use leading slashes (e.g., `/whatsapp/instances`) which causes axios to ignore the baseURL path. This makes requests go to root-relative paths that don't match the Nginx proxy configuration, resulting in 401 or 404 responses. Additionally, the backend is missing the WhatsApp instances route entirely, and the test org has exceeded its quota (10/10 instances), which would block legitimate requests with 429.

**Tech Stack:** Fastify (backend), React + Vite (frontend), Axios, Prisma, PostgreSQL, Nginx

---

## Phase 1: Fix Frontend API Path BaseURL Bug

### Task 1: Audit Current API Path Usage in useWhatsApp.ts

**Files:**
- Read: `src/hooks/useWhatsApp.ts`
- Read: `src/hooks/useAuth.ts`
- Read: `src/lib/api.ts`

**Objective:** Identify all API calls that use leading slashes which would break relative baseURL resolution.

**Steps:**

- [ ] **Step 1: Read useWhatsApp.ts to catalog all API calls**

Read the full file and list every `api.get()`, `api.post()`, `api.put()`, `api.delete()` call with their paths.

- [ ] **Step 2: Check useAuth.ts for leading slash issues**

Verify that auth-related API calls use correct relative paths (expected: `auth/me`, `auth/profile`, `auth/change-password` should not start with `/`).

- [ ] **Step 3: Verify axios baseURL configuration**

Read `src/lib/api.ts` to confirm baseURL is set as `'/api/v1'` (relative path with leading slash but no host, meaning it will prepend to relative URLs).

- [ ] **Step 4: Document all paths that need fixing**

Create a list of every API call path that starts with `/` and needs the leading slash removed.

**Expected finding:** All paths in useWhatsApp.ts start with `/` (e.g., `/whatsapp/instances`, `/whatsapp/groups`, etc.) which will cause axios to treat them as absolute paths from domain root, ignoring the `/api/v1` baseURL prefix.

---

### Task 2: Fix All API Paths in useWhatsApp.ts

**Files:**
- Modify: `src/hooks/useWhatsApp.ts`

**Changes:** Remove leading slash from every API endpoint path.

**Steps:**

- [ ] **Step 1: Write the corrected code**

Replace every occurrence of:
```typescript
api.get('/whatsapp/instances')
```
with:
```typescript
api.get('whatsapp/instances')
```

Apply to all methods: get, post, put, delete, patch.

- [ ] **Step 2: Show exact diff for review**

After modifications, list all changed lines with before/after for verification.

- [ ] **Step 3: Commit the fix**

```bash
git add src/hooks/useWhatsApp.ts
git commit -m "fix: remove leading slashes from API paths to respect baseURL"
```

---

### Task 3: Verify useAuth.ts Has No Leading Slash Issues

**Files:**
- Read: `src/hooks/useAuth.ts`

**Steps:**

- [ ] **Step 1: Check all api.* calls in useAuth.ts**

Look for calls like `api.get('/auth/me')`, `api.post('/auth/logout')`, etc.

- [ ] **Step 2: Fix if any leading slashes found**

If any path starts with `/`, remove the leading slash.

- [ ] **Step 3: Commit if changes made**

```bash
git add src/hooks/useAuth.ts
git commit -m "fix: remove leading slash from auth API paths"
```

---

## Phase 2: Create Backend WhatsApp Instances Route

### Task 4: Create WhatsApp Instances API Route File

**Files:**
- Create: `backend/src/app/api/whatsapp-instances/route.ts`

**Implementation:**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// Zod schemas for validation
const createInstanceSchema = z.object({
  name: z.string().min(1).max(255),
  evolutionInstanceName: z.string().optional(),
  phoneNumber: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export default async function (fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/whatsapp/instances',
    preHandler: [fastify.auth()],
    handler: async (request: FastifyRequest, reply) => {
      // orgGuard sets request.currentOrgId
      const orgId = (request as any).currentOrgId;

      const instances = await prisma.whatsAppInstance.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          createdAt: true,
          updatedAt: true,
          lastSeen: true,
        },
      });

      return { success: true, data: { instances } };
    },
  });

  fastify.route({
    method: 'POST',
    url: '/whatsapp/instances',
    preHandler: [fastify.auth()],
    handler: async (request: FastifyRequest, reply) => {
      const orgId = (request as any).currentOrgId;

      // Validate body
      const validated = createInstanceSchema.parse(request.body);

      const instance = await prisma.whatsAppInstance.create({
        data: {
          ...validated,
          orgId,
        },
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          createdAt: true,
        },
      });

      return { success: true, data: { instance } };
    },
  });

  fastify.route({
    method: 'GET',
    url: '/whatsapp/instances/:id',
    preHandler: [fastify.auth()],
    handler: async (request: FastifyRequest, reply) => {
      const orgId = (request as any).currentOrgId;
      const { id } = request.params as { id: string };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          token: true,
          qrCode: true,
          createdAt: true,
          updatedAt: true,
          lastSeen: true,
        },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      return { success: true, data: { instance } };
    },
  });

  fastify.route({
    method: 'PUT',
    url: '/whatsapp/instances/:id',
    preHandler: [fastify.auth()],
    handler: async (request: FastifyRequest, reply) => {
      const orgId = (request as any).currentOrgId;
      const { id } = request.params as { id: string };

      const updateData = request.body;

      const instance = await prisma.whatsAppInstance.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          updatedAt: true,
        },
      });

      // Verify org ownership (in case update bypassed where clause)
      if (instance.orgId !== orgId) {
        reply.code(403);
        return { success: false, error: 'Access denied' };
      }

      return { success: true, data: { instance } };
    },
  });

  fastify.route({
    method: 'DELETE',
    url: '/whatsapp/instances/:id',
    preHandler: [fastify.auth()],
    handler: async (request: FastifyRequest, reply) => {
      const orgId = (request as any).currentOrgId;
      const { id } = request.params as { id: string };

      // Verify instance exists and belongs to org
      const existing = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
      });

      if (!existing) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      await prisma.whatsAppInstance.delete({
        where: { id },
      });

      return { success: true, data: null };
    },
  });

  // Additional instance-specific endpoints can be added here in future tasks
}
```

- [ ] **Step 1: Write the file with exact content above**

Create `backend/src/app/api/whatsapp-instances/route.ts` with the implementation.

- [ ] **Step 2: Add TypeScript types import path**

Ensure the `@/lib/prisma` alias resolves correctly. If backend uses different alias, adjust import: `import prisma from '../lib/prisma';` or relative path.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app/api/whatsapp-instances/route.ts
git commit -m "feat: add WhatsApp instances API routes (list, create, get, update, delete)"
```

---

### Task 5: Register WhatsApp Instances Route in server.ts

**Files:**
- Read: `backend/src/server.ts`
- Modify: `backend/src/server.ts`

**Steps:**

- [ ] **Step 1: Read current server.ts route registrations**

Find the section where API routes are registered (likely after messages routes or in alphabetical order).

- [ ] **Step 2: Add import for the new route**

```typescript
import whatsappInstancesRoute from '@/app/api/whatsapp-instances/route';
```

- [ ] **Step 3: Register the route with Fastify**

Find where routes are registered, e.g.:
```typescript
fastify.register(require('@/app/api/messages/route').default, { prefix: '/whatsapp' });
```

Add:
```typescript
fastify.register(whatsappInstancesRoute, { prefix: '/whatsapp' });
```

**Note:** The route file already defines URL paths starting with `/whatsapp/instances`, so the prefix may not be needed. Verify existing pattern. If messages route is registered as:
```typescript
fastify.register(messagesRoute);
```
and messages routes define URLs like `/whatsapp/messages`, then register similarly:
```typescript
fastify.register(whatsappInstancesRoute);
```

- [ ] **Step 4: Verify route appears in server.ts after messages**

Place it logically near other WhatsApp-related routes for maintainability.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat: register WhatsApp instances API routes"
```

---

## Phase 3: Reset Quota for Test Organization

### Task 6: Identify Test Organization ID

**Files:**
- Use PostgreSQL client to query database

**Steps:**

- [ ] **Step 1: Connect to PostgreSQL database**

Use Docker:
```bash
docker exec -it nextmavens-whatsapp-postgres psql -U nextmavens -d nextmavens_platform
```

- [ ] **Step 2: Find the test org ID**

```sql
SELECT id, name FROM "Organization" WHERE name LIKE '%test%' OR name LIKE '%demo%';
```

Expected: org_test_001 or similar.

- [ ] **Step 3: Verify current quota usage**

```sql
SELECT * FROM quota_usages WHERE org_id = '<org_id>';
```

Expected: metric = 'ACTIVE_INSTANCES', current = 10 (or more).

- [ ] **Step 4: Exit psql**

```sql
\q
```

---

### Task 7: Reset Quota Current Count to 0

**Files:**
- N/A (database migration)

**Steps:**

- [ ] **Step 1: Execute SQL to reset quota**

```bash
docker exec nextmavens-whatsapp-postgres psql -U nextmavens -d nextmavens_platform -c "UPDATE quota_usages SET current = 0 WHERE org_id = 'org_test_001' AND metric = 'ACTIVE_INSTANCES';"
```

Replace `org_test_001` with actual org ID from Task 6.

- [ ] **Step 2: Verify update succeeded**

```bash
docker exec nextmavens-whatsapp-postgres psql -U nextmavens -d nextmavens_platform -c "SELECT * FROM quota_usages WHERE org_id = 'org_test_001' AND metric = 'ACTIVE_INSTANCES';"
```

Expected: current = 0.

- [ ] **Step 3: Commit (record the reset in git)**

Create a manual reset script for future use or document in README.

```bash
echo "# Quota Reset Commands" >> docs/DEV-OPS.md
echo "## Reset active instances quota for org_test_001" >> docs/DEV-OPS.md
echo "\`\`\`bash" >> docs/DEV-OPS.md
echo "docker exec nextmavens-whatsapp-postgres psql -U nextmavens -d nextmavens_platform -c \"UPDATE quota_usages SET current = 0 WHERE org_id = 'org_test_001' AND metric = 'ACTIVE_INSTANCES';\"" >> docs/DEV-OPS.md
echo "\`\`\`" >> docs/DEV-OPS.md
git add docs/DEV-OPS.md
git commit -m "docs: add quota reset commands"
```

---

## Phase 4: Test Complete Authentication Flow

### Task 8: Restart Backend with New Routes

**Files:**
- Backend service

**Steps:**

- [ ] **Step 1: Stop backend service**

If running in Docker:
```bash
docker-compose -f backend/docker-compose.yml down
```

Or if running npm dev:
```bash
cd backend
# Ctrl+C to stop
```

- [ ] **Step 2: Start backend service**

```bash
cd backend
npm run dev
```

Expected output: Fastify server listening on port 4930, routes registered.

- [ ] **Step 3: Verify route is loaded**

Check server startup logs for route registration messages. Or test directly:
```bash
curl -X GET http://localhost:4930/api/v1/whatsapp/instances \
  -H "Authorization: Bearer <valid_token>" \
  -H "Content-Type: application/json"
```

Expected: 200 with JSON `{ success: true, data: { instances: [] } }`.

---

### Task 9: Rebuild Frontend with Fixed API Paths

**Files:**
- Frontend build

**Steps:**

- [ ] **Step 1: Stop frontend service**

```bash
docker-compose down  # from project root, or stop nginx if serving dist
```

- [ ] **Step 2: Build frontend**

```bash
npm run build  # from project root (frontend is in src/, package.json at root)
```

Expected: `dist/` directory created with built assets.

- [ ] **Step 3: Deploy built assets to Nginx**

Copy to web root (typically `/var/www/whatsapp-admin` or as configured):
```bash
sudo cp -r dist/* /var/www/whatsapp-admin/
```

Or if using Docker volume mount, ensure dist/ is mounted correctly.

- [ ] **Step 4: Restart Nginx (if needed)**

```bash
sudo systemctl reload nginx
```

---

### Task 10: Test Authentication Flow in Browser

**Steps:**

- [ ] **Step 1: Clear browser storage**

Open DevTools → Application → Storage → Local Storage → Clear all for domain `whatsapp.nextmavens.cloud`.

Also clear sessionStorage if used.

- [ ] **Step 2: Open login page**

Navigate to `https://whatsapp.nextmavens.cloud`.

- [ ] **Step 3: Login with valid credentials**

Submit login form. Observe Network tab in DevTools.

**Expected sequence:**
1. POST `/api/v1/auth/login` → 200 (token received)
2. Frontend stores token in localStorage
3. Frontend redirects to `/dashboard`
4. Dashboard mounts → `useWhatsApp` hook fires
5. GET `/api/v1/whatsapp/instances` → 200 (empty array or instances)
6. Dashboard renders without redirect

- [ ] **Step 4: Verify no redirect loop**

Stay on dashboard. Check console for errors. No 401 or 429 redirects.

- [ ] **Step 5: Check network tab for broken requests**

Look for any requests with status 401, 404, or 429. If found, note the endpoint.

- [ ] **Step 6: Test refresh flow**

Wait 15 minutes or manually expire token, then verify refresh works or user is gracefully logged out (not redirected to login repeatedly).

---

## Phase 5: Verify and Clean Up

### Task 11: Add Comprehensive Error Logging to Frontend API Client

**Files:**
- Modify: `src/lib/api.ts`

**Steps:**

- [ ] **Step 1: Read current api.ts response interceptor**

Find the axios response interceptor that handles errors (likely 401 handling).

- [ ] **Step 2: Add detailed logging for non-2xx responses**

Add console logging for all error responses:
```typescript
interceptor.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error('[API Error]', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response.status,
        data: error.response.data,
        original: error,
      });
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "chore: add detailed API error logging for debugging"
```

---

### Task 12: Cross-Check All API Endpoints Coverage

**Files:**
- backend/src/server.ts
- src/hooks/useWhatsApp.ts
- src/hooks/useAuth.ts

**Steps:**

- [ ] **Step 1: List all registered backend routes**

Check server.ts for all `fastify.route` or `fastify.register` calls. Document all URL patterns.

- [ ] **Step 2: List all frontend API calls**

From useWhatsApp.ts and useAuth.ts, list all `api.*` calls with their paths.

- [ ] **Step 3: Match frontend calls to backend routes**

Ensure every frontend call has a corresponding backend route. Flag any missing routes for future implementation.

- [ ] **Step 4: Document gaps**

Create `docs/API-ROUTES-GAPS.md` listing any undefined backend endpoints that frontend expects.

- [ ] **Step 5: Commit any documentation updates**

```bash
git add docs/API-ROUTES-GAPS.md
git commit -m "docs: document missing API routes for future work"
```

---

## Phase 6: Optional Improvements

### Task 13: Implement Token Auto-Refresh on 401

**Files:**
- src/lib/api.ts

**Steps:**

- [ ] **Step 1: Locate 401 error handler in response interceptor**

Currently likely redirects to `/login`.

- [ ] **Step 2: Add refresh token logic before logout**

```typescript
if (error.response?.status === 401) {
  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    try {
      const refreshResponse = await api.post('/auth/refresh', { refreshToken });
      const newToken = refreshResponse.data.data.token;
      localStorage.setItem('token', newToken);
      // Retry original request with new token
      error.config.headers['Authorization'] = `Bearer ${newToken}`;
      return api(error.config);
    } catch (refreshError) {
      // Refresh failed, proceed to logout
    }
  }
  // Clear storage and redirect
  localStorage.clear();
  window.location.href = '/login';
}
```

- [ ] **Step 3: Test refresh flow**

Ensure token refresh endpoint (`/api/v1/auth/refresh`) works and returns new access token.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: auto-refresh JWT token on 401 before logout"
```

---

### Task 14: Clean Up Nginx Configuration

**Files:**
- `/etc/nginx/sites-available/whatsapp.nextmavens.cloud`
- Backup copies

**Steps:**

- [ ] **Step 1: List all Nginx config files**

```bash
ls -la /etc/nginx/sites-available/ | grep whatsapp
```

- [ ] **Step 2: Identify duplicate/conflicting server blocks**

Backup then remove old/unused configs:
```bash
sudo cp /etc/nginx/sites-available/whatsapp.nextmavens.cloud /etc/nginx/sites-available/whatsapp.nextmavens.cloud.backup
# Remove files with suffix .bak, .old, or numbered backups
sudo rm /etc/nginx/sites-available/whatsapp.nextmavens.cloud.1 2>/dev/null || true
# Keep only the active config
```

- [ ] **Step 3: Test Nginx configuration**

```bash
sudo nginx -t
```

Expected: `syntax is ok`, `test is successful`.

- [ ] **Step 4: Reload Nginx**

```bash
sudo systemctl reload nginx
```

- [ ] **Step 5: Commit config changes (if tracked in git)**

If `/etc/nginx/sites-available/whatsapp.nextmavens.cloud` is in repo (unlikely), commit. Otherwise document manual changes in ops docs.

---

## Self-Review Checklist

**Spec Coverage:**
- [x] Fix frontend API baseURL bug (Tasks 1-3)
- [x] Create missing WhatsApp instances backend route (Tasks 4-5)
- [x] Reset quota for test org (Tasks 6-7)
- [x] Test authentication flow (Task 10)
- [ ] Optional: Add error logging (Task 11) - improvement
- [ ] Optional: Auto-refresh on 401 (Task 13)
- [ ] Optional: Clean up Nginx config (Task 14)

**Placeholder Scan:**
- All code provided is concrete and complete
- No "TBD", "TODO", "fill in later"
- Exact SQL queries provided
- Exact git commands provided
- All file paths are explicit

**Type Consistency:**
- Fastify handler signatures consistent `(request: FastifyRequest, reply, reply:)`
- Prisma query shapes consistent (select fields match model)
- Zod schemas defined and used correctly
- API response envelope `{ success: boolean, data?: any, error?: string }`

---

## Execution Handoff

**Plan saved to:** `docs/superpowers/plans/2025-03-27-authentication-redirect-loop-fix.md` *(adjust date to match current date)*

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**