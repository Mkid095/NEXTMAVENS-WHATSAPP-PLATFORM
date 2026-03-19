# Phase 3 Step 4 Research: Invoice Generation & Download

**Date:** March 17, 2026
**Objective:** Research best practices for generating invoice PDFs, storing files, and providing download API in Node.js/TypeScript

---

## Technology Options

### PDF Generation Libraries

| Library | Type | Pros | Cons | Verdict |
|---------|------|------|------|---------|
| **PDFKit** | Pure Node.js | No browser dependency, excellent table support, chainable API, actively maintained | Lower-level API (more code than templating) | ✅ **Selected** - Perfect fit for invoice tables and full control |
| Puppeteer | Headless Chrome | Can use HTML/CSS templates (familiar), excellent rendering | Heavy ( Chromium ~100MB), slower, complex setup | ❌ Too heavy for server-side PDF generation |
| EasyInvoice | Specialized | Purpose-built for invoices, includes templates | Limited customization, older, small community | ❌ Too restrictive |
| invoice-pdf | Specialized | Stripe integration built-in | Outdated (11 years), limited | ❌ Abandoned |

**Decision: PDFKit** (`/folios/pdfkit` or `/websites/pdfkit`) - Benchmark Score 83.8, High reputation. Provides table rendering with borders, cell styling, row/col spans - essential for invoice line items.

---

### File Storage Strategies

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Filesystem** | Simple, no dependencies, fast local I/O | Not scalable horizontally, backup challenges | ✅ **Default for v1** - Keep it simple |
| AWS S3 | Scalable, durable, CDN integration | Requires SDK, credentials, cost | ⏭️ **Future** - Abstract storage interface to enable |
| CloudFlare R2 | S3-compatible, cheaper | Newer, less mature ecosystem | ⏭️ Future option |

**Decision: Filesystem with abstraction layer**. Create `StorageBackend` interface with `saveFile`, `getFile`, `deleteFile`. Default implementation uses `fs`. Future: S3Backend.

---

### Email Delivery (Optional for v1)

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| **Nodemailer** | Industry standard, SMTP support, attachments, HTML templates | Needs SMTP config | ⏭️ **Not in scope v1** - Could add in "send invoice" feature later |
| SendGrid SDK | API-based, high deliverability | Vendor lock-in, cost | ❌ Out of scope |

**Decision: Not implementing email in v1**. Focus on PDF generation and download only. Email can be added as a subsequent feature using Nodemailer with attachment support.

---

## Stripe Integration Considerations

**Important:** This step is about *invoice generation*, NOT payment collection. However, invoices often reference Stripe invoices or customers.

**Options:**
1. **Standalone invoices** - Generate invoices independent of Stripe. Useful for manual invoices, deposits, etc.
2. **Stpe-backed invoices** - Create Stripe invoice first, then generate matching PDF. Provides payment tracking.

**Decision: Hybrid approach**
- Store `stripeInvoiceId` (optional foreign key) on our Invoice model
- Support both: invoices with or without Stripe linkage
- Generate PDF from our own data (not from Stripe's hosted_invoice_url) for branding control
- If Stripe invoice exists, include payment link and "Pay Now" button in PDF

**Stripe API Usage:**
- Only needed to fetch customer/price data if we want to sync. Not required for v1.
- We'll store necessary data (customer email, amounts, currency) directly in our Invoice and InvoiceItem tables.

---

## Database Schema Design

We need 2 new Prisma models:

```prisma
model Invoice {
  id            String   @id @default(cuid())
  invoiceNumber String   @unique // Human-readable: INV-2026-001
  orgId         String   // Tenant isolation
  customerId    String   // Could be Stripe customer ID or internal
  customerName  String
  customerEmail String
  status        InvoiceStatus // DRAFT, FINALIZED, PAID, VOID, CANCELED
  currency      String   @default("usd")
  subtotalCents Int
  taxCents      Int?
  totalCents    Int
  taxRate       Float?   // Percentage (e.g., 0.0825 for 8.25%)
  notes         String?
  footerText    String?
  dueDate       DateTime?
  paidDate      DateTime?
  stripeInvoiceId String? // Reference to Stripe invoice (if created)
  filePath      String?  // Path to generated PDF on storage
  fileSize      Int?
  downloadedAt  DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  items         InvoiceItem[]
  payments      Payment[]
}

model InvoiceItem {
  id        String   @id @default(cuid())
  invoiceId String
  invoice   Invoice  @relation(fields: [invoiceId], references: [id])
  description String
  quantity  Float    // Could be decimal (e.g., 2.5 hours)
  unitPriceCents Int
  totalCents Int
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  @@index([invoiceId])
}
```

**InvoiceNumber Generation:**
- Format: `INV-YYYY-NNNN` (year + sequence per year)
- Implementation: Prisma `@updatedAt` trigger or application logic with sequence table
- Simpler: Use timestamp-based: `INV-${Date.now()}` guaranteed unique

**Enums:**
```prisma
enum InvoiceStatus {
  DRAFT
  FINALIZED
  PAID
  VOID
  CANCELED
}
```

---

## API Design

Following project conventions (admin routes, auth + orgGuard, JSON responses):

### Endpoints

| Method | Endpoint | Handler | Description |
|--------|----------|---------|-------------|
| POST | `/admin/invoices` | `createInvoice` | Create draft invoice with line items |
| PUT | `/admin/invoices/:id/finalize` | `finalizeInvoice` | Finalize (prevents edits) and generate PDF |
| GET | `/admin/invoices/:id` | `getInvoice` | Get invoice metadata (no PDF) |
| GET | `/admin/invoices/:id/download` | `downloadInvoice` | Stream PDF file |
| GET | `/admin/invoices` | `listInvoices` | List with filters (orgId, status, date range) |
| POST | `/admin/invoices/:id/send` | `sendInvoice` | Email invoice to customer (optional) |
| PUT | `/admin/invoices/:id/void` | `voidInvoice` | Mark as void |
| DELETE | `/admin/invoices/:id` | `deleteInvoice` | Soft delete |

**Note:** We'll implement core CRUD + download in v1. Email send can be future.

---

## PDF Template Design

Invoice PDF structure (using PDFKit):

```
┌─────────────────────────────────────────┐
│  Company Header (logo, name, address)  │
│  "INVOICE" + invoice number + date     │
├─────────────────────────────────────────┤
│  Bill To:                               │
│    Customer Name                        │
│    Customer Email                       │
│    Address (if available)               │
├─────────────────────────────────────────┤
│  Invoice Table:                         │
│  ┌─────┬────────────┬────────┬───────┐ │
│  │ Qty │ Description│ Unit $ │ Total │ │
│  ├─────┼────────────┼────────┼───────┤ │
│  │  2  │ Widget A   │  $10   │  $20  │ │
│  │  1  │ Setup Fee  │  $50   │  $50  │ │
│  └─────┴────────────┴────────┴───────┘ │
│  ───────────────────────────────────── │
│  Subtotal: $70                          │
│  Tax (8.25%): $5.78                    │
│  ───────────────────────────────────── │
│  TOTAL: $75.78                         │
├─────────────────────────────────────────┤
│  Footer: payment instructions, due date │
│  "Pay online at example.com/pay/inv-123"│
└─────────────────────────────────────────┘
```

**PDFKit Table Implementation:**
- Use `doc.table()` with column widths: `["*", "*", "80", "80"]` (description, unit, total)
- Row styling: Header row with background color, borders; alternating row colors optional
- Multi-line description support (PDFKit handles wrapping)
- Currency formatting: `Intl.NumberFormat('en-US', { style: 'currency', currency })`

---

## File Organization

```
backend/
├── src/
│   ├── lib/
│   │   └── build-invoice-generation-&-download/
│   │       ├── index.ts              # Main exports: generateInvoicePDF, storeInvoice, etc.
│   │       ├── pdf-generator.ts      # PDFKit wrapper, table rendering
│   │       ├── storage.ts            # StorageBackend interface + filesystem impl
│   │       ├── invoice-schema.ts     # Zod validation schemas
│   │       ├── invoice-model.ts      # Prisma operations (CRUD)
│   │       └── number-generator.ts   # Invoice number generation
│   └── app/
│       └── api/
│           └── build-invoice-generation-&-download/
│               └── route.ts          # 6-8 endpoints with validation
├── prisma/
│   └── schema.prisma                 # Add Invoice, InvoiceItem models
└── docs/
    └── INVOICE_GENERATION.md         # API docs, usage examples
```

---

## Validation Schemas (Zod)

```typescript
const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

const createInvoiceSchema = z.object({
  orgId: z.string().min(1),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email(),
  status: z.enum(['DRAFT', 'FINALIZED']).default('DRAFT'),
  currency: z.string().default('usd'),
  subtotalCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative().optional(),
  totalCents: z.number().int().positive(),
  taxRate: z.number().min(0).max(1).optional(),
  notes: z.string().max(1000).optional(),
  footerText: z.string().max(500).optional(),
  lineItems: z.array(invoiceItemSchema).min(1),
  dueDate: z.string().datetime().optional(),
  stripeInvoiceId: z.string().optional(),
});
```

---

## Security Considerations

- **Authentication**: All endpoints protected by auth + orgGuard (existing middleware)
- **Org Isolation**: Invoices belong to orgId; queries filter by orgId
- **Input Validation**: Zod schemas for all inputs (amounts non-negative, email format, etc.)
- **Path Traversal**: When streaming files, validate invoice ID and construct path safely; never use user input directly in file path
- **File Access**: Files stored in `./storage/invoices/{orgId}/{invoiceId}.pdf`; serve via stream after auth check
- **Size Limits**: Validate total cents to prevent overflow; enforce max file size (e.g., 10MB)

---

## Error Handling Strategy

- **Validation Errors** → 400 with Zod format details
- **Not Found** → 404 (invoice doesn't exist or org mismatch)
- **IO Errors** (disk full, read failure) → 500 with generic message, log details
- **Stripe Sync Errors** (if used) → 500 but don't fail invoice creation (best effort)

---

## Performance Considerations

- **PDF Generation**: Synchronous PDFKit generation; may be CPU-intensive for large invoices. Consider streaming directly to file without buffering in memory.
- **Concurrency**: Limit concurrent PDF generation? Not needed for v1 given low volume.
- **Caching**: Generated PDF should be stored and reused on subsequent downloads (no regeneration) - use `filePath` field.
- **Download**: Use `fs.createReadStream()` with appropriate headers (`Content-Type: application/pdf`, `Content-Disposition: inline; filename="INV-123.pdf"`)

---

## Metrics to Add

Add to existing Prometheus metrics (`create-comprehensive-metrics-dashboard-(grafana)/index.ts`):

- `invoice_generated_total` (counter) - labels: `orgId`, `status`
- `invoice_download_total` (counter) - labels: `orgId`
- `invoice_generation_duration_seconds` (histogram) - labels: `orgId`
- `invoice_file_size_bytes` (gauge) - labels: `orgId`

---

## Testing Strategy

### Unit Tests
- PDF generation with sample data → verify table layout, totals, formatting
- Invoice number generation → uniqueness, format
- Storage backend → save, retrieve, delete
- Validation schemas → accept valid, reject invalid

### Integration Tests
- POST /admin/invoices → create draft, validate DB record and file NOT created yet
- PUT /admin/invoices/:id/finalize → finalize, verify PDF generated and file exists
- GET /admin/invoices/:id/download → stream PDF with correct headers
- Error paths: 404 on invalid ID, 403 on org mismatch

### Manual Testing
- Create invoice with 10 line items → verify table pagination (PDFKit auto-paginates)
- Download → open inPreview/Chrome → check formatting
- Large invoice (50 items) → verify performance (<2s generation)

---

## Implementation Timeline (Estimated 6 hours)

| Task | Time | Dependencies |
|------|------|--------------|
| Prisma schema design & migration | 0.5h | - |
| Core library: PDF generator | 1.5h | PDFKit integration |
| Core library: Storage abstraction & filesystem | 0.5h | fs module |
| Core library: Invoice CRUD + validation | 1h | Zod, Prisma |
| API routes (5-6 endpoints) | 1h | Core library |
| Unit tests (80% coverage) | 1h | Jest |
| Integration tests (critical paths) | 0.5h | Test DB |
| Documentation & OpenAPI update | 0.5h | - |
| **Total** | **6h** | |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| PDFKit learning curve | PDF rendering bugs | Prototype early (step1) with simple table |
| File storage permissions | Server can't write/read files | Use absolute path with `process.cwd()`, ensure directory exists (`fs.mkdir -p`) |
| Large invoices cause memory issues | OOM crash | Stream directly to file; don't buffer entire PDF in memory |
| Invoice number collisions | Duplicate numbers | Use timestamp-based guaranteed unique format |
| Currency formatting errors | Wrong amounts displayed | Use Intl.NumberFormat with proper currency code |

---

## Conclusion

Selected **PDFKit** for PDF generation, **filesystem** for storage (abstracted), **Zod** for validation, **Prisma** for DB. Will implement 6 endpoints (create, get, list, finalize, download, void) with full validation, metrics, and tests.
