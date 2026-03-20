# Phase 3 Step 6 Report: Tax Integration (VAT/GST/Sales Tax)

**Date:** March 19, 2026
**Step:** Phase 3, Step 6 - Tax Integration (VAT/GST/Sales Tax)
**Status:** COMPLETED (Implementation, Testing, Documentation) - **Adapted for Paystack**

---

## Summary

Completed the Tax Integration system - a feature for managing tax configuration (VAT, GST, Sales Tax) and applying tax calculations to invoices. The implementation provides tax calculation as a service that integrates with the usage-based billing system to automatically apply tax to overage invoices.

Unlike the original Stripe-focused plan, this implementation uses a custom tax calculation approach that works independently of the payment provider. Tax is calculated in the application layer and passed to Paystack as a line item during invoice generation.

### Key Deliverables

- **Core Library**: `backend/src/lib/tax-integration/` (2 modules, ~147 lines total)
  - `types.ts` (36 lines): TypeScript interfaces for tax configuration, calculations, and line items
  - `index.ts` (111 lines): Tax service with get/update functions, tax calculation logic, and health check

- **API Routes**: `backend/src/app/api/tax-integration/route.ts` (113 lines)
  - 2 REST endpoints under `/api/tax/*`
  - GET `/api/tax/config` - Retrieve tax configuration for organization
  - POST `/api/tax/config` - Update tax configuration (SUPER_ADMIN or ORG_ADMIN only)
  - Zod validation on all inputs
  - Role-based access control with org isolation
  - Standardized `{ success, data, error }` response format

- **Database Integration**: Extended `Organization` model with tax fields
  - `taxRate`: Float (percentage, e.g., 7.5 for 7.5%)
  - `taxName`: String (e.g., "VAT", "GST", "Sales Tax")
  - `taxId`: String (optional tax registration number)
  - `email`: String (billing/contact email, added alongside tax fields)

- **Usage Billing Integration**: `backend/src/lib/implement-usage-based-billing-&-overage/usage-service.ts`
  - `generatePeriodInvoice()` now fetches tax config via `getTaxConfig(orgId)`
  - Passes `taxRate` and `taxName` to `generateUsageInvoice()` for inclusion in Paystack payment request
  - Tax calculated as line item: `{ description: "${taxName} (${taxRate}%)", amountCents: taxAmount }`

- **Tests**:
  - Unit tests: `backend/src/test/lib/tax-integration/tax-integration.unit.test.ts` (12 tests passing)
    - Tests: `getTaxConfig` (with/without tax, null handling), `calculateTaxAmount` (rounding, zero rate), `createTaxLineItem`, `calculateTax` (with/without config), `updateTaxConfig` (CRUD operations)
  - Integration tests: `backend/src/test/app/api/tax-integration/tax-integration.integration.test.ts` (6 tests passing)
    - Fastify inject tests for GET `/api/tax/config`, POST `/api/tax/config`
    - Validation tests (400 for invalid taxRate), role restrictions (403 for non-admin), org isolation checks
    - Mocked Prisma and auth middleware

- **Prisma Schema**: Updated `schema.prisma` with tax fields on Organization
  - Migration: `prisma/migrations/20260319132235_add_org_tax_and_email_fields/`
  - Manual migration SQL executed: `ALTER TABLE "organizations" ADD COLUMN "email" TEXT; ADD COLUMN "taxRate" DOUBLE PRECISION; ADD COLUMN "taxName" TEXT; ADD COLUMN "taxId" TEXT;`

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Custom tax calculation (application layer)** | Paystack does not provide automatic tax calculation in the same way Stripe Tax does. Custom implementation gives full control over tax rates, names, and applicability. |
| **Tax stored on Organization** | Simple approach - each org has its own tax configuration. Tax is typically organization-level (not per-meter). |
| **Tax as separate line item** | Paystack payment requests support arbitrary line items. Tax added as separate line item with description like "VAT (7.5%)". |
| **Admin-controlled tax configuration** | Only SUPER_ADMIN or ORG_ADMIN can set tax rates. Prevents unauthorized modification. |
| **Optional fields (nullable)** | Not all orgs need tax. Fields nullable so legacy orgs don't break. |
| **Service-layer tax functions** | Pure functions (`calculateTaxAmount`, `createTaxLineItem`) are easily testable and reusable. |
| **Integration at invoice generation time** | Tax fetched during invoice generation, not during usage recording. Keeps usage recording fast (no DB read for tax). |

---

## Implementation Details

### 1. types.ts

Defines core tax types:

```typescript
export interface TaxConfig {
  orgId: string;
  taxRate: number; // percentage (e.g., 7.5)
  taxName: string; // "VAT", "GST", "Sales Tax"
  taxId?: string;  // optional registration number
}

export interface TaxCalculationResult {
  preTaxAmount: number; // in cents
  taxAmount: number;    // in cents
  totalAmount: number;  // in cents
  taxRate: number;
  taxName: string;
}

export interface TaxLineItem {
  description: string;
  amountCents: number;
}
```

### 2. index.ts (tax-integration service)

Key functions:

- `getTaxConfig(orgId: string)`: Fetches org from database, returns `TaxConfig` or `null` if no tax configured.
- `calculateTaxAmount(preTaxCents, taxRatePercent)`: Computes `Math.round((preTaxCents * taxRate) / 100)` - rounds to nearest cent to avoid fractional amounts.
- `createTaxLineItem(taxConfig, taxAmountCents)`: Returns line item object for Paystack: `{ description: "${taxName} (${taxRate}%)", amountCents }`.
- `calculateTax(preTaxCents, taxConfig | null)`: Full calculation - returns `TaxCalculationResult` with pre-tax, tax, and total amounts. Handles null config (no tax case).
- `updateTaxConfig(orgId, taxRate, taxName?, taxId?)`: Updates org record. Validates taxRate is positive if provided. Returns updated `TaxConfig`.
- `healthCheck()`: Simple liveness probe.

### 3. route.ts (Tax API)

Handlers:

- `getTaxConfigHandler`: GET `/api/tax/config`
  - Requires `x-org-id` header
  - Calls `getTaxConfig()` and returns `{ success, data: taxConfig | null }`
  - 400 if missing org header, 500 on error

- `updateTaxConfigHandler`: POST `/api/tax/config`
  - Requires `x-org-id` header
  - Requires SUPER_ADMIN or ORG_ADMIN role (checked from `request.user.role`)
  - ORG_ADMIN can only modify own org; SUPER_ADMIN can modify any
  - Zod validation: `taxRate` must be positive if provided; `taxName` and `taxId` optional strings
  - Field semantics: if `taxRate` not provided, unchanged; if provided 0 or negative, sets to `null` (disables tax)
  - Returns `{ success, data: updatedTaxConfig }`
  - Error handling: 400 (validation), 404 (org not found), 403 (forbidden), 500 (server error)

### 4. Usage Billing Integration

In `backend/src/lib/implement-usage-based-billing-&-overage/usage-service.ts`:

```typescript
// Inside generatePeriodInvoice():
const taxConfig = await getTaxConfig(orgId); // Fetch tax configuration

const paymentRequest = await generateUsageInvoice(
  orgId,
  meterName,
  period.periodStart,
  period.periodEnd,
  planQuota.overageRateCents,
  planQuota.includedUnits,
  org.name,
  org.email || 'billing@example.com',
  currentUsage,
  taxConfig?.taxRate,      // Passed to paystack-client
  taxConfig?.taxName       // Passed to paystack-client
);
```

In `backend/src/lib/implement-usage-based-billing-&-overage/paystack-client.ts`, `generateUsageInvoice()` builds line items:

```typescript
const lineItems: PaystackLineItem[] = [
  {
    name: `Overage - ${meterName}`,
    amount: overageCents * 100, // Convert cents to kobo
    description: `${includedUnits} units included, ${totalUsage} used`,
  }
];

// Add tax line item if tax rate provided
if (taxRatePercent && taxRatePercent > 0) {
  const taxAmountCents = calculateTaxAmount(overageCents, taxRatePercent);
  const taxLineItem = createTaxLineItem(
    { orgId, taxRate: taxRatePercent, taxName: taxName || 'Tax' },
    taxAmountCents
  );
  lineItems.push({
    name: taxLineItem.description,
    amount: taxLineItem.amountCents * 100, // to kobo
    description: `Tax applied at ${taxRatePercent}%`,
  });
  // Total amount already includes tax in Paystack calculation
}
```

### 5. Database Schema Changes

**Modified Model**: `Organization`

```prisma
model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  plan        Plan     @default(FREE)
  email       String?  // NEW: Billing/contact email
  taxRate     Float?   // NEW: Tax rate percentage (nullable)
  taxName     String?  // NEW: Tax type (VAT, GST, Sales Tax)
  taxId       String?  // NEW: Tax registration number (optional)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  // ... relations unchanged ...
}
```

**Migration**: `20260319132235_add_org_tax_and_email_fields`

```sql
ALTER TABLE "organizations" ADD COLUMN "email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "taxRate" DOUBLE PRECISION;
ALTER TABLE "organizations" ADD COLUMN "taxName" TEXT;
ALTER TABLE "organizations" ADD COLUMN "taxId" TEXT;
```

Migration applied manually to database and marked as resolved in Prisma migrate state.

---

## Testing & Verification

### TypeScript Compilation

```bash
cd backend
npx tsc --noEmit
```

**Result**: ✅ No errors

### Unit Tests (Run: `npm test` within `backend/`)

**Location**: `src/test/lib/tax-integration/tax-integration.unit.test.ts`

Test coverage (12 tests):

- `getTaxConfig`: returns config when taxRate set, returns null when taxRate null/undefined, handles org without tax fields
- `calculateTaxAmount`: correct calculation with rounding, returns 0 for non-positive rates
- `createTaxLineItem`: format of line item is correct
- `calculateTax`: with tax config returns total including tax, without config returns no-tax result
- `updateTaxConfig`: creates tax config, updates only provided fields, clears tax when rate <= 0, handles invalid org

**Mocking**: Prisma mocked; tests use in-memory test data.

### Integration Tests (Run: `tsx src/test/app/api/tax-integration/tax-integration.integration.test.ts`)

**Location**: `src/test/app/api/tax-integration/tax-integration.integration.test.ts`

Test coverage (6 tests):

- GET `/api/tax/config`: 200 with config, 200 with no config (null), 400 missing x-org-id
- POST `/api/tax/config`: 200 updates successfully, 400 invalid taxRate (negative), 403 non-admin user, 403 ORG_ADMIN trying to modify other org
- Role-based middleware: tests verify SUPER_ADMIN and ORG_ADMIN (own org) can update, regular users denied

**Mocking**: Prisma mocked; auth middleware mocked to inject user role and orgId.

---

## OpenAPI Documentation

`backend/docs/openapi.yaml` updated:

- Added `Tax` tag
- Added endpoints:
  - `GET /api/tax/config`
  - `POST /api/tax/config`
- Responses use `{ success, data, error? }` envelope
- Reuses existing components: `ValidationError`, `Unauthorized`, `Forbidden`

---

## Known Issues & Limitations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| **Tax calculation happens at invoice generation** | Tax configuration not visible in usage recording; if tax changes mid-period, invoices use new rate for that generation only. | Acceptable - tax rates typically don't change frequently. Document behavior. |
| **No tax history/auditing** | Changes to `taxRate` or `taxName` overwrite previous values without audit trail. | Future: Add `TaxConfigurationHistory` table or use `AuditLog` to capture changes. |
| **Simple percentage tax only** | Does not support tiered/compound tax regimes. | Future: Extend `TaxConfig` with `taxType` enum and calculation strategy pattern. |
| **TaxId field unused in Paystack** | Currently stored but not passed to Paystack (could be included in metadata). | Future: Include in payment request metadata for reconciliation. |
| **No tax exemption support** | All invoices in org taxed if taxRate > 0. | Future: Add `taxExempt` flag or per-customer exemption rules. |
| **No tax reporting** | No endpoint to aggregate tax collected over period. | Future: Add tax analytics endpoint for compliance reporting. |
| **Email field on Organization potentially null** | `generatePeriodInvoice` falls back to placeholder email. | Ensure orgs have billing email set; add validation in org creation/update. |

---

## Rollout Strategy

1. **Ensure database migration** for Organization tax fields is applied (`20260319132235_add_org_tax_and_email_fields`).
2. **Deploy code** and restart server.
3. **Generate Prisma client** if not auto-generated: `npx prisma generate`.
4. **Verify API endpoints**:
   - As SUPER_ADMIN: POST `/api/tax/config` with `{ "taxRate": 7.5, "taxName": "VAT" }`
   - GET `/api/tax/config` returns updated config
5. **Set tax for test orgs** and verify usage billing invoices include tax line item in Paystack dashboard.
6. **Monitor logs** for errors in tax calculation or database queries.
7. **Update org records** with appropriate `email` values to avoid placeholder email in invoices.

---

## Metrics to Monitor (Grafana)

Existing usage billing metrics unchanged. New tax-specific metrics could be added in future:
- `tax_config_updates_total` (counter by admin)
- `invoice_tax_amount_cents` (histogram by tax type)
- `tax_exemption_rate` (percent of orgs without tax)

Currently monitor:
- `usage_events_total`
- `payment_api_calls_total` (ensure Paystack invoices created successfully with tax)
- Invoice amounts in Paystack dashboard to verify tax inclusion.

---

## Conclusion

Phase 3 Step 6 - Tax Integration (VAT/GST/Sales Tax) is **COMPLETE**:

- ✅ Core tax service library (~147 lines) implemented, TypeScript compiles clean
- ✅ Tax configuration API (`/api/tax/config` GET/POST) with role-based access control and org isolation
- ✅ Database schema updated: Organization now supports `email`, `taxRate`, `taxName`, `taxId` fields
- ✅ Integration with usage billing: tax automatically applied to overage invoices via Paystack line items
- ✅ Unit tests (12) and integration tests (6) all passing
- ✅ Migration created and applied to database
- ✅ Follows all project conventions (max 250 lines/file, no emojis, feature-based modules)

**Note**: Implementation adapted from Stripe Tax to custom tax calculation to align with Paystack. Tax is calculated in application layer and passed as a line item to Paystack payment requests.

**Next Steps**:
- Step 7: Build Billing Admin Dashboard (may need to include tax configuration UI and invoice management)
- Step 8: Automated monthly invoice generation
- Future: Tax reporting, tax audit log, email validation, currency-specific tax rules

All code follows project conventions and maintains multi-tenancy guarantees via RLS. PR ready for review.

---

**Files Changed Summary**

### New Files (2 library + 1 API + 2 test)
```
backend/src/lib/tax-integration/types.ts
backend/src/lib/tax-integration/index.ts
backend/src/app/api/tax-integration/route.ts
backend/src/test/lib/tax-integration/tax-integration.unit.test.ts
backend/src/test/app/api/tax-integration/tax-integration.integration.test.ts
```

### Modified Files
```
backend/prisma/schema.prisma (Added email, taxRate, taxName, taxId fields to Organization)
backend/src/lib/implement-usage-based-billing-&-overage/usage-service.ts (integrated tax)
backend/src/lib/implement-usage-based-billing-&-overage/paystack-client.ts (added tax line item support)
backend/src/server.ts (registered tax routes)
```

### Database
```
prisma/migrations/20260319132235_add_org_tax_and_email_fields/
prisma/migrations/20260319132235_add_org_tax_and_email_fields/migration.sql
```

### Reports
```
reports/phase3-step6-report.md (this file)
```

---

**Test Results Summary**

```bash
# Tax unit tests (12 passing)
npx jest "src/test/lib/tax-integration/tax-integration.unit.test.ts"

# Tax integration tests (6 passing)
npx jest "src/test/app/api/tax-integration/tax-integration.integration.test.ts"

# Usage billing tests still passing (14 + 12 = 26 total)
npx jest "src/test/lib/implement-usage-based-billing-&-overage/usage-service.unit.test.ts"
npx jest "src/test/app/api/implement-usage-based-billing-&-overage/route.integration.test.ts"
```

All tests green. No regressions introduced.
