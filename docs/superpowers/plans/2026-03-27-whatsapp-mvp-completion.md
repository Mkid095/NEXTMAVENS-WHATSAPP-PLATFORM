# WhatsApp MVP Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-ready WhatsApp messaging platform with Phases 1-2 fully operational (core messaging, security, reliability), plus verified infrastructure and documentation for future phases.

**Architecture:** The system consists of:
- **Frontend Nginx** → **Backend API** (Fastify on port 4930) → **Evolution API** (WhatsApp gateway on port 3001) → **WhatsApp Cloud**
- Backend handles: webhooks, auth, rate limiting, quotas, instance management, message queue (Redis/BullMQ), idempotency, metrics (Prometheus), and audit logging
- Evolution API manages WhatsApp connections and message delivery

**Tech Stack:** Node.js/TypeScript, Fastify, PostgreSQL + Prisma, Redis, BullMQ, Docker (Evolution API), Nginx, systemd, Grafana/Prometheus

---

## File Structure

```
 backend/
  src/
    server.ts                    # Main entry point (already has routes)
    lib/
      prisma.ts                  # Database client
      rate-limiting-with-redis/
      implement-quota-enforcement-middleware/
      implement-idempotency-key-system/
      create-comprehensive-metrics-dashboard-(grafana)/
      message-retry-and-dlq-system/
      feature-management/
      ... (other phase1-2 modules)
  .env                           # Environment configuration
  docker-compose.yml (evolution-api/)  # WhatsApp gateway
/etc/nginx/sites-available/
  api.nextmavens.cloud          # Nginx config for API routing
/etc/systemd/system/
  whatsapp-backend.service      # Systemd service for backend
  redis.service                 # Redis service
  postgresql.service            # PostgreSQL service
/home/ken/next-mavens-vps/logs/ # Nginx logs
```

---

## Task 1: Fix Nginx Routing for API Backend

**Problem:** Nginx is routing api.nextmavens.cloud to port 3002 but backend runs on 4930.

### Step 1.1: Pre-flight - Verify required tools exist

```bash
command -v sudo && sudo -v
command -v nginx
command -v curl
command -v jq
command -v ss
```

Expected: All commands exist (no "not found").

- [ ] **Step:** Verify tools available

### Step 1.2: Backup current Nginx config

```bash
sudo cp /etc/nginx/sites-available/api.nextmavens.cloud /etc/nginx/sites-available/api.nextmavens.cloud.backup-$(date +%s)
```

- [ ] **Step:** Backup Nginx config

### Step 1.3: Update Nginx upstream configuration

**File:** `/etc/nginx/sites-available/api.nextmavens.cloud`

Edit the upstream block to point to port 4930:

```nginx
upstream api_backend {
    server 127.0.0.1:4930;  # Changed from 3002
    keepalive 64;
}
```

Also ensure server block has proper security headers and rate limiting. Compare with emails.nextmavens.cloud config for reference.

- [ ] **Action:** Read the file: `sudo cat /etc/nginx/sites-available/api.nextmavens.cloud`
- [ ] **Action:** Ensure upstream has `server 127.0.0.1:4930;` (not 3002)
- [ ] **Action:** Add security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, CSP) if missing
- [ ] **Action:** Add rate limiting: `limit_req zone=api_limit burst=30 delay=10;` inside server HTTPS block
- [ ] **Action:** Test Nginx config: `sudo nginx -t`
- [ ] **Action:** Reload Nginx: `sudo systemctl reload nginx`

**Expected:** Nginx config test passes, no errors.

### Step 1.4: Verify Nginx → Backend connectivity

```bash
curl -sI https://api.nextmavens.cloud/health
```

Expected: `HTTP/2 200` with JSON body containing `"status": "healthy"`.

If still 404 or error, check:
- Access logs: `sudo tail -20 /home/ken/next-mavens-vps/logs/api-nginx-access.log`
- Error logs: `sudo tail -20 /home/ken/next-mavens-vps/logs/api-nginx-error.log`
- Backend listening: `ss -tulpn | grep 4930`
- Backend health directly: `curl -s http://localhost:4930/health`

- [ ] **Step:** Test API health via Nginx, expect 200
- [ ] **Step:** If failing, check logs and diagnose
- [ ] **Step:** Confirm direct localhost:4930/health works
- [ ] **Step:** Confirm api.nextmavens.cloud/health works through Nginx
- [ ] **Commit:** Changes to Nginx config and any fixes

---

## Task 2: Verify Backend is Running with All Phase 1-2 Features

The backend is running on port 4930 via systemd. Let's verify all core subsystems are initialized.

### Step 2.1: Pre-flight - Verify backend dependencies installed

```bash
cd /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/backend
test -d node_modules || echo "node_modules missing - need npm ci"
npm run lint 2>&1 | head -20  # Check for any type errors (should be clean)
```

Expected: node_modules exists, `npm run lint` exits with code 0 (or if errors, they're from commented Phase 3 routes only).

- [ ] **Step:** Check node_modules directory
- [ ] **Step:** Run lint, note any errors (should be none for core code)
- [ ] **Step:** If dependencies missing, run `npm ci`

### Step 2.2: Check backend service status

```bash
sudo systemctl status whatsapp-backend --no-pager
```

Expected: `active (running)`

Check logs for successful initialization:

```bash
sudo journalctl -u whatsapp-backend -n 100 --no-pager | grep -E "Initialized|registered|healthy"
```

Expected logs should show:
- Rate limiter initialized
- Quota limiter initialized
- Idempotency initialized
- Metrics endpoint available
- Retry DLQ system (if enabled)
- Feature flags initialized
- All route registrations (evolutions, quotas, heartbeats, etc.)

- [ ] **Step:** Check systemd status
- [ ] **Step:** Review logs for successful startup messages
- [ ] **Step:** If any errors, diagnose and fix based on log output
- [ ] **Commit:** Any necessary service file or configuration updates

### Step 2.2: Create test tenant and API key (via database seeding)

The admin API may not exist yet. We'll seed the database directly with a default tenant and API key.

**Connect to PostgreSQL:**

```bash
sudo -u postgres psql nextmavens_research
```

**Check existing tables:**

```sql
\dt
```

Look for `tenants`, `api_keys` tables.

**Insert default tenant:**

```sql
INSERT INTO tenants (id, name, slug, plan, created_at, updated_at)
VALUES (
  'tenant-default',
  'Default Tenant',
  'default',
  'starter',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
```

**Insert API key (generate a random secret):**

First, generate a random API key token:

```bash
openssl rand -hex 32
```

Use the output as `{api_key_token}`.

Then in psql:

```sql
INSERT INTO api_keys (id, tenant_id, name, key, created_at, updated_at, last_used_at)
VALUES (
  'apikey-default',
  'tenant-default',
  'Default API Key',
  '{api_key_token}',
  NOW(),
  NOW(),
  NULL
) ON CONFLICT (id) DO NOTHING;
```

**Verify:**

```sql
SELECT id, name, key FROM api_keys WHERE tenant_id = 'tenant-default';
```

**Record the API key:** Save `{api_key_token}` to a file: `echo "{api_key_token}" > /tmp/test-api-key.txt`

Exit psql: `\q`

- [ ] **Step:** List tables with `\dt` to confirm tenants and api_keys exist
- [ ] **Step:** Insert default tenant (run SQL, should say INSERT 0 1 or DO NOTHING)
- [ ] **Step:** Generate API key token with `openssl rand -hex 32`
- [ ] **Step:** Insert API key (replace {api_key_token})
- [ ] **Step:** Verify by querying: `sudo -u postgres psql nextmavens_research -c "SELECT id, key FROM api_keys WHERE tenant_id='tenant-default'"`
- [ ] **Step:** Save token: `echo {api_key_token} > /tmp/test-api-key.txt`
- [ ] **Commit:** Record seed SQL in docs if needed

### Step 2.3: Test authenticated API endpoints

**Test health endpoint (no auth):**

```bash
curl -s https://api.nextmavens.cloud/health | jq .
```

Expected: `{ "status": "healthy", ... }`

**Test instances listing (auth required):**

```bash
API_KEY=$(cat /tmp/test-api-key.txt)
curl -s https://api.nextmavens.cloud/api/v1/whatsapp/instances \
  -H "Authorization: Bearer $API_KEY" | jq .
```

Expected: `[]` (empty array) or list of instances.

If you get 401/403, check:
- Backend logs: `sudo journalctl -u whatsapp-backend -n 50 --no-pager | tail -20`
- Verify API key is in database: `sudo -u postgres psql nextmavens_research -c "SELECT * FROM api_keys WHERE key='$API_KEY';"`

**Test rate limiting:** make 50 rapid requests:

```bash
for i in {1..50}; do
  curl -s -o /dev/null -w "%{http_code} " https://api.nextmavens.cloud/api/v1/whatsapp/instances -H "Authorization: Bearer $API_KEY"
done
echo ""
```

Expected: First ~30 requests return 200, then 429 (rate limited).

- [ ] **Step:** Test /health returns 200 JSON
- [ ] **Step:** Test /api/v1/whatsapp/instances with API key returns 200
- [ ] **Step:** Test rate limiting (burst=30), get 429 after limit
- [ ] **Step:** Check backend logs for any errors during these tests
- [ ] **Commit:** Any fixes to auth middleware, rate limiting

---

## Task 3: Fix Evolution API Health, Webhook Routing, and Initialize WhatsApp Instance

**Critical findings:**
- Evolution container is running but health check is failing (or not defined)
- Webhook Nginx config (webhook.nextmavens.cloud) points to port 3000 (nothing listening)
- Evolution's webhook URL is set to `https://webhook.nextmavens.cloud/whatsapp` but backend webhook route is at `/api/webhooks/evolution`
- Need to fix Nginx, update Evolution config, restart, then create instance

### Step 3.1: Get actual Evolution API credentials

Evolution API key is stored in docker-compose, not `.env`:

```bash
grep AUTHENTICATION_API_KEY /home/ken/evolution-api/docker-compose.yml
```

Output: `AUTHENTICATION_API_KEY=mavens-evolution-sec-key-2024`

**Record this:** `echo "mavens-evolution-sec-key-2024" > /tmp/evolution-api-key.txt`

Also note webhook secret (for signature verification):

```bash
docker exec nextmavens-whatsapp-evolution env | grep EVOLUTION_WEBHOOK_SECRET_KEY
```

Record secret: `docker exec nextmavens-whatsapp-evolution printenv EVOLUTION_WEBHOOK_SECRET_KEY | tee /tmp/evolution-webhook-secret.txt`

**Note:** Backend expects this secret in its `.env` as `EVOLUTION_WEBHOOK_SECRET`. It currently has a placeholder value - update it after we get the actual secret.

- [ ] **Step:** Get API key from docker-compose: `grep AUTHENTICATION_API_KEY /home/ken/evolution-api/docker-compose.yml`
- [ ] **Step:** Save API key to /tmp/evolution-api-key.txt
- [ ] **Step:** Get webhook secret from container: `docker exec nextmavens-whatsapp-evolution env | grep EVOLUTION_WEBHOOK_SECRET_KEY`
- [ ] **Step:** Save webhook secret to /tmp/evolution-webhook-secret.txt

### Step 3.2: Fix webhook Nginx routing (critical)

Currently webhook.nextmavens.cloud points to port 3000 (nothing running). It must route to backend port 4930 to reach webhook endpoint `/api/webhooks/evolution`.

**Backup config:**

```bash
sudo cp /etc/nginx/sites-available/webhook.nextmavens.cloud /etc/nginx/sites-available/webhook.nextmavens.cloud.backup-$(date +%s)
```

**Edit:** `/etc/nginx/sites-available/webhook.nextmavens.cloud`

Change upstream:

```nginx
upstream webhook_backend {
    server 127.0.0.1:4930;  # Changed from 3000
    keepalive 64;
}
```

Also add security headers and rate limiting (similar to api.nextmavens.cloud):

Inside HTTPS server block, add:

```nginx
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    limit_req zone=api_limit burst=30 delay=10;
```

**Test and reload:**

```bash
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] **Step:** Backup webhook Nginx config
- [ ] **Step:** Update upstream to port 4930
- [ ] **Step:** Add security headers and rate limiting
- [ ] **Step:** Test Nginx config (nginx -t)
- [ ] **Step:** Reload Nginx
- [ ] **Commit:** Nginx config changes

### Step 3.3: Fix Evolution webhook URL to match backend

Evolution is currently configured with `WEBHOOK_GLOBAL_URL=https://webhook.nextmavens.cloud/whatsapp`, but the backend webhook route is at `/api/webhooks/evolution`. We need to correct this.

**Stop Evolution container:**

```bash
docker compose -f /home/ken/evolution-api/docker-compose.yml stop
```

**Edit docker-compose:**

File: `/home/ken/evolution-api/docker-compose.yml`

Change line 16:

```yaml
      - WEBHOOK_GLOBAL_URL=https://webhook.nextmavens.cloud/api/webhooks/evolution   # changed from /whatsapp
```

**Restart:**

```bash
docker compose -f /home/ken/evolution-api/docker-compose.yml up -d
docker compose -f /home/ken/evolution-api/docker-compose.yml ps
```

Wait 30 seconds, check logs:

```bash
docker logs nextmavens-whatsapp-evolution --tail 50 | grep -i "webhook\|http"
```

- [ ] **Step:** Stop Evolution container
- [ ] **Step:** Edit docker-compose.yml, update WEBHOOK_GLOBAL_URL
- [ ] **Step:** Start Evolution container
- [ ] **Step:** Verify container is up (docker ps)
- [ ] **Step:** Check logs for webhook URL configuration
- [ ] **Commit:** docker-compose.yml change

### Step 3.4: Update backend .env with actual Evolution webhook secret

Backend `.env` has placeholder `EVOLUTION_WEBHOOK_SECRET`. Update it with the actual secret from the container.

```bash
echo "EVOLUTION_WEBHOOK_SECRET=$(cat /tmp/evolution-webhook-secret.txt)" >> /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/backend/.env
```

Alternatively, edit `.env` and replace the value.

**Restart backend to pick up new env var:**

```bash
sudo systemctl restart whatsapp-backend
sleep 5
sudo systemctl status whatsapp-backend --no-pager | head -10
```

Check logs to confirm webhook signature verification initialized:

```bash
sudo journalctl -u whatsapp-backend -n 50 --no-pager | grep -i webhook
```

Expected: No signature verification errors when webhook arrives.

- [ ] **Step:** Update backend .env with real webhook secret
- [ ] **Step:** Restart backend service
- [ ] **Step:** Verify backend starts without errors
- [ ] **Commit:** .env update (but be careful: .env may be in .gitignore - don't commit secrets! Just note in docs instead)

### Step 3.5: Check Evolution health (container-level)

Evolution API doesn't have a `/health` endpoint. Docker health check uses `/` (root). Verify container is healthy:

```bash
docker inspect nextmavens-whatsapp-evolution --format='{{json .State.Health}}' | jq .
```

Expected: `"Status":"healthy"` (may take 30s after start).

Also check logs for any errors:

```bash
docker logs nextmavens-whatsapp-evolution --tail 100 | grep -i error || echo "No errors"
```

Ensure Redis connection is OK:

```bash
docker logs nextmavens-whatsapp-evolution --tail 50 | grep -i redis
```

Expected: "Redis connected" or similar.

- [ ] **Step:** Check container health status (should be healthy)
- [ ] **Step:** Check logs for errors, Redis connectivity
- [ ] **Step:** If unhealthy, investigate (permissions, network, port conflicts)
- [ ] **Step:** Restart container if needed: `docker compose -f /home/ken/evolution-api/docker-compose.yml restart`
- [ ] **Wait:** 30-60s, then recheck
- [ ] **Commit:** Any docker-compose fixes

### Step 3.6: Create first WhatsApp instance

**Get API key:** `API_KEY=$(cat /tmp/evolution-api-key.txt)`

**Create instance (without token initially):**

```bash
curl -s -X POST http://localhost:3001/instance/create/main \
  -H "apikey: $API_KEY" | jq .
```

Expected: `{"instance":"main","status":"created","qrcode":"data:image/png..."}`

If response includes base64 QR code, open in browser or decode to file:

```bash
curl -s -X POST http://localhost:3001/instance/create/main \
  -H "apikey: $API_KEY" | jq -r '.qrcode' | cut -d',' -f2 | base64 -d > /tmp/qrcode.png
# Open image or display
```

**Alternative: Get QR code separately if not in create response:**

```bash
curl -s -X GET http://localhost:3001/instance/qrcode/main \
  -H "apikey: $API_KEY" | jq .
```

**Scan QR code** with WhatsApp mobile app (Business WhatsApp recommended). Wait for connection.

**Poll connection status:**

```bash
while true; do
  STATUS=$(curl -s http://localhost:3001/instance/fetchInstances -H "apikey: $API_KEY" | jq -r '.instances[]?.connectionStatus')
  echo "Status: $STATUS"
  [[ "$STATUS" == "open" ]] && break
  sleep 5
done
```

When `open`, instance is connected and ready to send/receive messages.

**Verify webhook is set** (should be auto-configured from docker-compose `WEBHOOK_GLOBAL_URL`). Check instance config:

```bash
curl -s http://localhost:3001/instance/fetchInstances -H "apikey: $API_KEY" | jq .
```

Look for `"webhook": { "enabled": true, "url": "https://webhook.nextmavens.cloud/api/webhooks/evolution" }` in the instance object.

- [ ] **Step:** Create instance named "main" via Evolution API
- [ ] **Step:** Retrieve QR code, scan with WhatsApp phone
- [ ] **Step:** Poll until connectionStatus = "open"
- [ ] **Step:** Verify webhook URL is configured correctly
- [ ] **Step:** Record instance ID and status
- [ ] **Commit:** Document connection procedure

### Step 3.7: Verify webhook routing end-to-end

**Trigger a test webhook** from Evolution (if supported). Some versions have a test endpoint:

```bash
curl -s -X POST http://localhost:3001/webhook/test \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event":"message.received","data":{}}' | jq .
```

Or simpler: send a message from phone to the WhatsApp instance and check if webhook arrives.

**Monitor backend logs while sending a message:**

```bash
sudo journalctl -u whatsapp-backend -f | grep -i webhook
```

On phone, send a WhatsApp message to the business number. Expected: Backend logs show webhook received and verified.

Check no signature errors:

```bash
sudo journalctl -u whatsapp-backend -f | grep -i "signature\|hmac" | head -10
```

Expected: Either none or verification succeeded.

**Monitor webhook Nginx access logs:**

```bash
sudo tail -f /home/ken/next-mavens-vps/logs/webhook-nginx-access.log
```

Expected: POST from Evolution IP (localhost:3001) to `/api/webhooks/evolution` returns 200.

- [ ] **Step:** Send test message from phone to WhatsApp instance
- [ ] **Step:** Observe backend logs for webhook events
- [ ] **Step:** Check webhook Nginx access log for 200 responses
- [ ] **Step:** If 401/403, check webhook secret matches between Evolution and backend
- [ ] **Commit:** Fix webhook signature verification if needed

---

## Task 4: Test End-to-End Message Flow

### Step 4.1: Send a test message via backend API

**Assuming backend has route POST /api/v1/whatsapp/send**

```bash
curl -s -X POST https://api.nextmavens.cloud/api/v1/whatsapp/send \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+{your_phone_number}",
    "message": "Hello from NextMavens test!"
  }' | jq .
```

Expected: `{ "status": "queued", "messageId": "..." }`

Check message in Redis queue:

```bash
redis-cli LLEN bull:queue:welcome:sendMessage
```

Check backend logs:

```bash
sudo journalctl -u whatsapp-backend -f
```

Look for logs showing message processing and Evolution API call.

- [ ] **Step:** Send test message through backend
- [ ] **Step:** Verify it's queued and processed
- [ ] **Step:** Check Evolution API logs: `docker logs nextmavens-whatsapp-evolution --tail 50`
- [ ] **Step:** Confirm message delivered to WhatsApp (receive on phone)
- [ ] **Commit:** Any fixes to message sending logic

### Step 4.2: Test inbound webhook

From Evolution API, trigger a test webhook (if supported), or send a WhatsApp message to the instance and verify backend receives it.

Backend should have route POST /api/v1/whatsapp/webhook that accepts Evolution webhook events (message sent, message received, etc.).

Check backend logs when receiving:

```bash
sudo journalctl -u whatsapp-backend --since 1 minute ago | grep -i webhook
```

- [ ] **Step:** Send WhatsApp message TO the connected instance (from another phone)
- [ ] **Step:** Verify backend webhook endpoint logs the event
- [ ] **Step:** Check database for message record (if persistence implemented)
- [ ] **Commit:** Fix webhook parsing or signature verification if broken

---

## Task 5: Verify Monitoring and Alerting (Grafana)

The infra repo should have Grafana configured with alerting rules. Let's verify.

### Step 5.1: Check Grafana is running and accessible locally

```bash
curl -s http://localhost:3005/api/health | jq .
```

Or check container:

```bash
docker ps | grep grafana
```

If not running:

```bash
cd /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/../monitoring
docker compose up -d grafana
```

- [ ] **Step:** Check Grafana container status
- [ ] **Step:** Access http://localhost:3005 in browser (credentials stored in docker-compose)
- [ ] **Step:** Verify datasource (Prometheus) is configured
- [ ] **Step:** Check alert rules are loaded (CPU, Memory, Disk)

### 5.2: Test alerting triggers

Create a CPU load to trigger alerts:

```bash
stress-ng --cpu 4 --timeout 60s
```

Or reduce alert thresholds temporarily if needed.

Check Grafana alerts panel and notification targets (email/Slack if configured).

- [ ] **Step:** Review provisioning config: `ls monitoring/grafana/provisioning/`
- [ ] **Step:** Verify alert rules files
- [ ] **Step:** Simulate load and confirm alerts fire
- [ ] **Commit:** Any missing alert rules or datasource fixes

---

## Task 6: Document Phase 3 (Billing) Requirements and Known Gaps

**Current state:** Some Phase 3 routes are actively registered and running (workflow orchestration, invoice generation). Others are commented out due to potential TypeScript errors or missing implementations.

From `server.ts`:

**Active Phase 3 routes:**
- `/admin/workflows` - Workflow orchestration admin API
- `/admin/invoices` - Invoice generation & download admin API

**Commented Phase 3 routes (not registered):**
- `/api/usage` and `/admin/usage` - Usage-based billing & overage
- `/api/tax` - Tax integration (Stripe tax or VAT)
- `/admin/billing` - Billing admin dashboard
- `/admin/features` - Feature management admin API

Also note: Directory `src/lib/build-coupon-&-discount-system/` exists but routes are likely not integrated.

### Step 6.1: Verify which route files exist

Check presence of route files:

```bash
ls -la /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/backend/src/app/api/
```

Confirm directories:
- `workflow-orchestration/` (should exist)
- `build-invoice-generation-&-download/` (should exist)
- `implement-usage-based-billing-&-overage/` (may not exist)
- `tax-integration/` (may not exist)
- `build-billing-admin-dashboard/` (may not exist)
- `admin/features/` (may not exist)

- [ ] **Step:** List `src/app/api/` directory contents
- [ ] **Step:** For each missing directory, mark as "needs implementation" in docs
- [ ] **Step:** For existing directories, continue to next step

### Step 6.2: Test active Phase 3 routes (workflow, invoices)

**Confirm they are working without errors.** Check logs for any registration errors:

```bash
sudo journalctl -u whatsapp-backend -n 100 --no-pager | grep -E "workflow|invoice|registered"
```

Expected: "[SERVER] Workflow orchestration admin routes registered" and "Invoice generation & download admin routes registered" with no errors.

If there were errors during startup, they'll appear in logs with stack traces.

**Test endpoints (if accessible):**

Workflows list (requires admin auth - may not have admin routes yet):

```bash
API_KEY=$(cat /tmp/test-api-key.txt)
curl -s https://api.nextmavens.cloud/admin/workflows -H "Authorization: Bearer $API_KEY" | jq .
```

Invoices:

```bash
curl -s https://api.nextmavens.cloud/admin/invoices -H "Authorization: Bearer $API_KEY" | jq .
```

- [ ] **Step:** Check logs for workflow/invoice registration errors
- [ ] **Step:** If errors found, capture error messages
- [ ] **Step:** Test endpoints to see if they return 200 or error (expected: might 404 if subroutes not defined)
- [ ] **Step:** Document any issues found

### Step 6.3: Check for missing dependencies (Stripe, Paystack, pdfkit)

Check if Phase 3 uses external services:

- **Stripe:** `.env` has `STRIPE_SECRET_KEY=sk_test_xxx` (placeholder). Real Stripe integration needs actual keys and webhook endpoint.
- **Paystack:** `PAYSTACK_SECRET_KEY=sk_test_placeholder` - placeholder for African payments, may be required.
- **pdfkit:** Already in `dependencies` - should work if invoice routes use it.

Also check for any missing schema fields in Prisma:

```bash
grep -E "stripe|subscription|invoice|coupon|payment" /home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/backend/prisma/schema.prisma | head -20
```

Look for models: `Invoice`, `Subscription`, `PaymentMethod`, `Coupon`, etc.

- [ ] **Step:** Check .env for Stripe and Paystack keys (placeholders indicate not configured)
- [ ] **Step:** Check Prisma schema for billing-related tables
- [ ] **Step:** Document missing tables / fields needed for Phase 3
- [ ] **Step:** Note that actual payment provider credentials must be obtained and configured

### Step 6.4: Create Phase 3 completion report

File: `docs/PHASE3-COMPLETION.md`

Structure:

```markdown
# Phase 3 (Billing) Completion Requirements

## Active Routes (Working)
- Workflow Orchestration: `/admin/workflows`
- Invoice Generation: `/admin/invoices`

Status: Tested, no errors observed. [Or describe errors if any]

## Missing Routes (Not Implemented or Broken)

### 1. Usage-Based Billing (`/api/usage`, `/admin/usage`)
- **Status:** Route file likely missing
- **What it does:** Track message usage per tenant, calculate overage charges
- **Dependencies:** Quota data from `message_metrics`, Stripe/Paystack integration
- **Estimated effort:** 2-3 days

### 2. Tax Integration (`/api/tax`)
- **Status:** Not present
- **What it does:** VAT/Tax calculation for invoices, Stripe Tax integration
- **Dependencies:** Stripe, tax database tables
- **Estimated effort:** 1 day

### 3. Billing Admin Dashboard (`/admin/billing`)
- **Status:** Not present
- **What it does:** Revenue metrics, tenant billing status, payment method management
- **Dependencies:** Invoice and subscription data
- **Estimated effort:** 2 days

### 4. Feature Management (`/admin/features`)
- **Status:** Not present
- **What it does:** Toggle features per tenant (enable/disable messages, AI features, etc.)
- **Dependencies:** Feature flag schema
- **Estimated effort:** 0.5 days

### 5. Coupon & Discount System
- **Status:** Library exists but routes missing
- **What it does:** Create/apply discount codes to invoices
- **Dependencies:** Invoice system
- **Estimated effort:** 1 day

### 6. Payment Method Management
- **Status:** Not present
- **What it does:** Add, update, delete credit cards/Paystack tokens
- **Dependencies:** Stripe/Paystack SDKs
- **Estimated effort:** 1 day

## Required External Configuration
- Stripe account with secret key and webhook endpoint
- Paystack account (if used for African payments)
- Webhook endpoints registered with providers to point to: `https://api.nextmavens.cloud/api/webhooks/stripe` (hypothetical)

## Database Schema Gaps
[Insert additional tables needed: `Subscription`, `InvoiceLineItem`, `PaymentMethod`, `Coupon`, `TaxRate`, etc.]

## Test Scenarios Needed
- Invoice generation and PDF download
- Usage metering accuracy (messages counted correctly)
- Stripe webhook handling (signature verification)
- Overage billing calculations
- Coupon application and validation
- Tax calculation per jurisdiction

## Recommended Order of Implementation
1. Complete usage metering (foundation for billing)
2. Stripe integration (subscriptions, payment methods)
3. Invoice generation & PDF (already partly done)
4. Tax system
5. Admin dashboard
6. Coupons & discounts
7. Testing suite for billing

**Total estimated time:** 10-12 days
```

- [ ] **Step:** Create `docs/PHASE3-COMPLETION.md` with above structure
- [ ] **Step:** Fill in actual status based on findings from 6.1-6.3
- [ ] **Step:** Provide concrete recommendations and next steps
- [ ] **Commit:** docs/PHASE3-COMPLETION.md

---

## Task 7: Create Roadmap for Phases 4-8

Given current state, provide rough estimates and technical approach for remaining phases.

### Step 7.1: Document Phase 4 (API & Developer Experience)

Key features:
- OpenAPI/Swagger auto-generation from Fastify routes (use fastify-oas)
- API versioning strategy (v1 prefix already implied)
- SDK generation (OpenAPI → TypeScript, Python, Go)
- Developer portal frontend (static site or Next.js?)
- Webhook signature verification enhancements
- API security: scopes, rate limits per API key

Check if any Phase 4 modules already exist in `/src/lib`:
- search for "openapi", "swagger", "sdk", "developer-portal", "webhooks"

- [ ] **Step:** Write Phase 4 scope and missing modules list
- [ ] **Step:** Estimate effort (story points/hours)
- [ ] **Step:** Identify technical dependencies (must precede Phase 5?)
- [ ] **Commit:** docs/PHASE4-ESTIMATE.md

### Step 7.2: Document Phase 5 (Super Admin & Monitoring Dashboard)

This is a frontend/admin UI to view:
- Multi-tenant metrics (revenue, usage, message volumes)
- Tenant management (CRUD, suspend, plan changes)
- Alerting dashboard integration (Grafana panels embedded or separate)
- Audit logs viewer (from Phase 1)
- Revenue charts

Tech choices needed:
- Frontend framework? (Next.js? Svelte? Plain HTML+JS?)
- Authentication integration (SSO to backend admin API)
- Charting library (Chart.js, Recharts)

- [ ] **Step:** Write Phase 5 scope and architecture options
- [ ] **Step:** Recommend tech stack based on existing frontend patterns (check for any existing admin UI)
- [ ] **Step:** Estimate effort
- [ ] **Commit:** docs/PHASE5-ESTIMATE.md

### Step 7.3: Document Phase 6 (Testing & Quality Assurance)

Current test coverage: unknown. Need baseline.

Coverage needed:
- Unit tests for all lib modules (target 80%+)
- Integration tests: API endpoints, Evolution webhook handling, message queue
- Load testing: JMeter or k6 scripts for 1000 msg/min
- Security testing: OWASP ZAP scan, npm audit, dependency updates
- Mutation testing (Stryker?)

- [ ] **Step:** Write Phase 6 scope
- [ ] **Step:** Recommend test framework conventions (Jest already in package.json)
- [ ] **Step:** Provide test file structure
- [ ] **Step:** Estimate effort (could be large: 80 hours)
- [ ] **Commit:** docs/PHASE6-ESTIMATE.md

### Step 7.4: Document Phase 7 (Advanced UX & Features)

Features:
- WebSocket real-time updates (Socket.IO already in deps)
- Message reactions
- Full-text search (Elasticsearch? or PostgreSQL trigram?)
- Dark mode (admin UI)
- AI integration (Claude API for message suggestions, auto-replies, sentiment)
- Analytics dashboard (per-tenant usage breakdown)
- A/B testing framework

- [ ] **Step:** Write Phase 7 scope and break down features
- [ ] **Step:** Prioritize must-have vs nice-to-have
- [ ] **Step:** Estimate per feature
- [ ] **Commit:** docs/PHASE7-ESTIMATE.md

### Step 7.5: Document Phase 8 (Deployment & Production Readiness)

Infrastructure as code:
- Terraform for VPS, DNS, SSL, databases, Redis
- CI/CD pipelines (GitHub Actions: test, build, deploy)
- SOC2 compliance checklist
- Backup & DR procedures (already have daily backups, test restore)
- Monitoring: Loki for logs, Jaeger for tracing?
- Rollback strategies (blue-green, canary)
- Security hardening checklist (already done partially)

Check current deployment:
- Already using systemd + Docker
- Need IaC to recreate VPS automatically
- Need staging environment

- [ ] **Step:** Write Phase 8 scope
- [ ] **Step:** Audit current production setup (what's manual, what's automated)
- [ ] **Step:** Provide Terraform module plan
- [ ] **Step:** Estimate effort
- [ ] **Commit:** docs/PHASE8-ESTIMATE.md

---

## Task 8: Final System Validation and Sign-off

### Step 8.1: Create a "System Status" summary document

File: `docs/SYSTEM-STATUS-2026-03-27.md`

Include:
- ✅ All services running (list with systemctl/docker status)
- ✅ Ports and domains working (api.nextmavens.cloud, private.nextmavens.cloud)
- ✅ Database backups tested
- ✅ Monitoring verified
- ❌ Phase 3 billing: incomplete, see docs/PHASE3-COMPLETION.md
- ⏳ Phases 4-8: planned, see estimates

Also include:
- How to restart services
- How to add a new WhatsApp instance
- How to monitor logs
- Emergency contacts (you)

- [ ] **Step:** Write SYSTEM-STATUS document
- [ ] **Step:** Include verification commands output
- [ ] **Commit:** docs/SYSTEM-STATUS-2026-03-27.md

### Step 8.2: Tag the current state in git

```bash
git add -A
git commit -m "docs: add system status and phase completion estimates"
git tag v0.9.0-mvp-complete
git push origin main --tags
```

- [ ] **Step:** Commit all documentation changes
- [ ] **Step:** Create git tag
- [ ] **Step:** Push to remote
- [ ] **Verify:** `git log --oneline -5` and `git tag -l`

---

## Testing Strategy

Each task includes verification steps. For critical tasks:
- Test API endpoints with `curl` and validate JSON response
- Check service logs for errors
- Confirm ports are listening
- Validate Nginx config syntax
- Verify database connectivity with Prisma

No unit test writing required as part of this plan (that's Phase 6), but integration checks are mandatory.

---

## Notes for Subagent

- Run in worktree `whatsapp-mvp-completion` (already active)
- Execute tasks in order; later tasks depend on earlier ones
- If a task fails, diagnose and fix before proceeding
- Commit frequently with descriptive messages
- Use `sudo` for system file edits (Nginx, systemd)
- Always backup before modifying system configs
- Keep the Phase 3 routes commented out after Task 6.1 (until they're fixed properly)

---

**Total estimated time:** 1-2 days (8-16 hours)
