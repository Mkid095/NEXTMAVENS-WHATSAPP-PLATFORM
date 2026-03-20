# Phase 3 Step 5 Research: Implement Usage-Based Billing & Overage

## Executive Summary

This research focuses on implementing usage-based billing (also called consumption-based billing) with overage handling using Paystack as the payment provider. The goal is to bill customers based on actual usage rather than fixed subscription fees, with automatic charges for usage beyond included quotas.

**Note**: The implementation evolved from initial Stripe research to Paystack integration to better serve the African market with local payment methods (cards, bank transfer, mobile money).

## Key Concepts

### What is Usage-Based Billing?
Usage-based billing (UBB) charges customers based on their actual consumption of a product or service, rather than a flat monthly fee. Examples include:
- API calls (per 1,000 requests)
- Data transfer (per GB)
- Compute resources (per CPU hour)
- Messages sent (per WhatsApp message)
- Tokens processed (per AI token)

### Overage
Overage refers to usage beyond the included quota in a subscription. For example, a plan might include 10,000 API calls per month, with additional calls billed at $0.50 per 1,000 calls.

## Paystack Payment Request API

Paystack provides a Payment Request API (also called Invoice API) that allows creating invoices with line items. This is suitable for usage-based billing where overage charges are calculated and billed at the end of the billing period.

### Core Concepts

1. **Customer**: Paystack customer record (email, name, phone). Required for invoices.
   - Created automatically via `getOrCreateCustomer()` if not exists.

2. **Payment Request (Invoice)**: A bill sent to a customer.
   - Contains line items (description, amount, quantity)
   - Has a due date, status (draft/sent/paid), and payment link
   - Can be finalized and sent via email

3. **Line Item**: Individual charge on an invoice.
   - `name`: Description (e.g., "api_requests overage (5000 units)")
   - `amount`: Price in kobo (smallest NGN unit; multiply NGN by 100)
   - `quantity`: Number of units (usually 1 for overage line items)

4. **Amount Calculation**: Paystack expects amounts in kobo.
   ```typescript
   const amountKobo = Math.round(overageCents / 100); // Convert cents to kobo
   ```

### Creating an Invoice

```
1. Ensure customer exists (or create)
2. Create draft payment request with line items
   POST /paymentrequest
   {
     "customer": "CUS_xxxxx",
     "description": "Usage billing for March 2025",
     "line_items": [
       {"name": "api_requests overage (5000 units)", "amount": 25000, "quantity": 1}
     ],
     "due_date": "2025-04-07",
     "draft": true
   }
3. (Optional) Finalize: POST /paymentrequest/finalize/:code
4. Send to customer: POST /paymentrequest/send/:code
```

### Implementation Flow

```
1. Record usage events locally (fast, no external API)
2. At billing period end or admin trigger:
   - Fetch current period usage from DB
   - Compare to quota to calculate overage
   - If overage > 0:
     a. Create line item with overage units × rate
     b. Create draft payment request via Paystack
     c. (Optional) Finalize and send automatically
3. Store payment request details for reconciliation
```

### Important Notes
- Paystack does not provide real-time meter events like Stripe. Invoices are created explicitly.
- Amounts are in **kobo** (NGN). For USD plans, convert to NGN before creating invoice.
- Payment requests can be created in draft mode and finalized later.
- Customer records must have valid email for invoice delivery.
- API rate limits apply (check Paystack docs).

## Technical Architecture

### Database Schema

```sql
-- Track cumulative usage counters (for quick lookup)
CREATE TABLE organization_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  usage_value NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, meter_name, period_start, period_end)
);

-- Store raw usage events (for audit/reconciliation)
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  stripe_meter_event_id TEXT,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB
);

-- Subscription usage quotas (plan definitions)
CREATE TABLE plan_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  included_units NUMERIC NOT NULL DEFAULT 0,
  overage_rate_cents NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(plan_id, meter_name)
);
```

### Architecture Pattern

```
┌─────────────┐
│   Client    │ sends usage event
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Fastify Route       │ POST /api/usage/events
│ - Auth middleware   │ - Validate input
│ - OrgGuard          │ - Check quota limits
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Usage Service       │ Core logic
│ - Record event      │ - Update counters
│ - Send to Stripe    │ - Enforce limits
│ - Check overage     │ - Emit metrics
└──────┬──────────────┘
       │
       ├──────────────┬─────────────┐
       ▼              ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Postgres│  │  Redis  │  │ Stripe  │
   │ (usage) │  │ (cache) │  │  Meter  │
   └─────────┘  └─────────┘  └─────────┘
```

### Key Implementation Details

1. **Real-time vs Batched Recording**
   - **Real-time**: Send each event to Stripe immediately (simpler, more API calls)
   - **Batch**: Accumulate locally, send periodically (reduces Stripe API calls, better for high volume)
   - Recommendation: Use BullMQ queue for reliable batch processing

2. **Quota Enforcement**
   - Check current usage + incoming event against quota before recording
   - Allow soft limit (warning) or hard limit (block)
   - Overage can be:
     - Block additional usage
     - Allow with automatic charges (per overage rate)
     - Require manual approval

3. **Multi-tenancy**
   - All usage must be scoped by `org_id`
   - Ensure org isolation in queries
   - Use Row Level Security (RLS) in PostgreSQL

4. **Observability**
   - Prometheus metrics:
     - `usage_events_total` (counter by org, meter)
     - `usage_overage_charges_cents` (counter)
     - `usage_quota_remaining` (gauge)
   - Logging with structured JSON for analysis

5. **Error Handling**
   - Stripe API failures: retry with exponential backoff
   - Database failures: transactional consistency
   - Duplicate events: idempotency keys to prevent double-counting

### Security Considerations

1. **Authentication**: All usage endpoints require authenticated user with valid org
2. **Authorization**: User must belong to the org they're reporting usage for
3. **Rate Limiting**: Prevent abuse via excessive usage event submissions
4. **Input Validation**:
   - Value must be numeric and positive
   - Meter name must be from allowed list (whitelist)
   - Timestamp must be recent (prevent backdating abuse)
5. **RLS**: Enable PostgreSQL RLS on usage tables with `org_id` policies

### Testing Strategy

1. **Unit Tests**
   - Usage service methods
   - Quota calculation logic
   - Overages detection
   - Stripe API mocking

2. **Integration Tests**
   - End-to-end usage event recording
   - Quota enforcement
   - Database state verification
   - Webhook handling (if applicable)

3. **Mocking Stripe**
   - Use `stripe-mock` or custom jest mock for Stripe API
   - Simulate meter event creation responses
   - Test error scenarios (rate limits, invalid meter)

### OpenAPI Documentation

```yaml
/usage/events:
  post:
    summary: Record usage event
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - meter
              - value
            properties:
              meter:
                type: string
                description: Meter name (e.g., "api_requests", "messages_sent")
              value:
                type: number
                description: Quantity used
              timestamp:
                type: string
                format: date-time
                description: When usage occurred (defaults to now)
    responses:
      201:
        description: Usage recorded
      400:
        description: Invalid input or quota exceeded
      401:
        description: Unauthorized
      403:
        description: Forbidden (org mismatch)
```

## Implementation Plan

### Step 1: Core Library (`src/lib/implement-usage-based-billing-&-overage/`)
- `index.ts`: Main exports (recordUsage, getUsage, getOverage)
- `usage-service.ts`: Core business logic
- `stripe-client.ts`: Stripe API wrapper with retry logic
- `quota-calculator.ts`: Quota and overage calculation
- `types.ts`: TypeScript interfaces

### Step 2: API Routes (`src/app/api/implement-usage-based-billing-&-overage/`)
- `route.ts`: POST /api/usage/events (record usage)
- GET /api/usage/current (get current period usage)
- GET /api/usage/analytics (query historical usage)
- (Optional) webhook endpoint for Stripe events

### Step 3: Testing & Validation
- Unit tests for service layer
- Integration tests for API endpoints
- Full test suite pass (`npm run test:all`)
- TypeScript compilation (`npm run lint`)

## Relevant Stripe Documentation

- [Usage-based billing overview](https://docs.stripe.com/billing/subscriptions/usage-based)
- [Recording usage with Meter Events](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
- [Billing Meters API reference](https://docs.stripe.com/api/billing/meter)
- [Meter Events API reference](https://docs.stripe.com/api/billing/meter-event)
- [Usage analytics](https://docs.stripe.com/billing/subscriptions/usage-based/analytics)
- [Migration from legacy usage records](https://docs.stripe.com/billing/subscriptions/usage-based-legacy/migration-guide)

## Decisions To Make

1. **Real-time vs Batch**: Should we send usage to Stripe immediately or queue for batch processing?
   - Real-time: Simpler, but more Stripe API calls, no retry queue
   - Batch: More complex (need BullMQ worker), but reliable and cost-effective

2. **Quota enforcement point**:
   - At API gateway (fastify route)
   - In service layer
   - In database constraint

3. **Caching strategy**:
   - Redis for current period usage counters (fast quota checks)
   - PostgreSQL as source of truth

4. **Webhooks needed?**: For real-time notifications of Stripe billing events (invoice.payment_succeeded, etc.)

5. **Granularity of usage records**: Store every event vs aggregated rollups?

## Estimated Complexity

- **Simple implementation**: Record events directly to Stripe, minimal caching (3-4 hours)
- **Production-ready**: With queue, caching, retries, metrics, thorough testing (7-8 hours)

## Recommended Stack

- **Stripe SDK**: `stripe` npm package (already in dependencies from previous steps)
- **Queue**: BullMQ (already in project for workflow engine)
- **Cache**: Redis (already in project)
- **Metrics**: Prometheus client (already in project)
- **Validation**: Zod (already in project)
- **Storage**: Prisma with PostgreSQL (existing)

## Next Steps

1. Finalize architectural decisions with team
2. Create git branch: `phase3-step-5-implement-usage-based-billing-overage`
3. Implement core library with TDD
4. Implement API routes with Zod validation
5. Write integration tests
6. Update OpenAPI spec
7. Run full test suite
8. Write step 5 report
9. Update phase3.json
10. Create PR and merge
