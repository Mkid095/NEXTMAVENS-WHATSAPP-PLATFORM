/**
 * Paystack Client for Usage-Based Billing
 * Wrapper around Paystack REST API for Invoice/Payment Request management
 */

interface PaystackCustomer {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  customer_code: string;
  createdAt: string;
  updatedAt: string;
}

interface PaystackLineItem {
  name: string;
  amount: number; // in kobo (smallest currency unit)
  quantity: number;
}

interface PaystackPaymentRequest {
  id: number;
  domain: string;
  amount: number; // total in kobo
  currency: string;
  due_date: string;
  description: string;
  line_items: PaystackLineItem[];
  tax?: Array<{ name: string; amount: number }>;
  request_code: string;
  status: 'pending' | 'completed' | 'failed';
  paid: boolean;
  paid_at?: string;
  metadata?: Record<string, any>;
  offline_reference: string;
  customer: number | PaystackCustomer;
  created_at: string;
  invoice_number?: number;
  pdf_url?: string;
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
}

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Make authenticated request to Paystack API
 */
async function paystackRequest<T>(
  endpoint: string,
  method: string = 'POST',
  body?: any
): Promise<{ status: boolean; message: string; data: T }> {
  const url = `${PAYSTACK_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok || data.status !== true) {
    const error = new Error(data.message || 'Paystack API error');
    (error as any).status = data.status;
    (error as any).code = data.code;
    throw error;
  }

  return data as { status: boolean; message: string; data: T };
}

/**
 * Create or retrieve a customer by email
 * Returns customer code for use in invoices
 */
export async function getOrCreateCustomer(
  email: string,
  firstName?: string,
  lastName?: string,
  phone?: string
): Promise<{ id: number; customer_code: string; email: string }> {
  // First, try to find existing customer by email
  try {
    const searchResult = await paystackRequest<{ data: PaystackCustomer[] }>(
      `/customer?email=${encodeURIComponent(email)}`,
      'GET'
    );
    if (searchResult.data.data && searchResult.data.data.length > 0) {
      const customer = searchResult.data.data[0];
      return { id: customer.id, customer_code: customer.customer_code, email: customer.email };
    }
  } catch (error) {
    // Customer not found, will create new
    console.log(`[Paystack] Customer not found for ${email}, creating new`);
  }

  // Create new customer
  const result = await paystackRequest<{ data: PaystackCustomer }>('/customer', 'POST', {
    email,
    first_name: firstName,
    last_name: lastName,
    phone,
  });

  const customer = result.data;
  return { id: customer.id, customer_code: customer.customer_code, email: customer.email };
}

/**
 * Create a payment request (invoice) with line items
 *
 * Amount in line_items should be in kobo (multiply NGN by 100)
 * Example: 1000.50 NGN = 100050 kobo
 */
export async function createPaymentRequest(
  customerEmail: string,
  description: string,
  lineItems: Array<{ name: string; amountKobo: number; quantity: number }>,
  options?: {
    dueDate?: Date;
    sendNotification?: boolean;
    draft?: boolean;
    metadata?: Record<string, any>;
    tax?: Array<{ name: string; amount: number }>; // tax amount in kobo
  }
): Promise<PaystackPaymentRequest> {
  // Get or create customer
  const customer = await getOrCreateCustomer(customerEmail);

  const payload: any = {
    customer: customer.customer_code,
    description,
    line_items: lineItems.map(item => ({
      name: item.name,
      amount: item.amountKobo,
      quantity: item.quantity,
    })),
    ...(options?.tax && { tax: options.tax }), // Paystack tax array
    ...(options?.dueDate && { due_date: options.dueDate.toISOString().split('T')[0] }),
    ...(options?.sendNotification !== undefined && { send_notification: options.sendNotification }),
    ...(options?.draft && { draft: options.draft }),
    ...(options?.metadata && { metadata: options.metadata }),
  };

  const result = await paystackRequest<{ data: PaystackPaymentRequest }>('/paymentrequest', 'POST', payload);
  return result.data;
}

/**
 * Finalize a payment request (draft → active)
 */
export async function finalizePaymentRequest(requestCode: string): Promise<PaystackPaymentRequest> {
  const result = await paystackRequest<{ data: PaystackPaymentRequest }>(
    `/paymentrequest/finalize/${requestCode}`,
    'POST',
    { send_notification: true }
  );
  return result.data;
}

/**
 * Send a payment request to customer via email
 */
export async function sendPaymentRequest(requestCode: string): Promise<PaystackPaymentRequest> {
  const result = await paystackRequest<{ data: PaystackPaymentRequest }>(
    `/paymentrequest/send/${requestCode}`,
    'POST'
  );
  return result.data;
}

/**
 * Get a payment request by ID or code
 */
export async function getPaymentRequest(idOrCode: string | number): Promise<PaystackPaymentRequest> {
  const result = await paystackRequest<{ data: PaystackPaymentRequest }>(
    `/paymentrequest/${idOrCode}`,
    'GET'
  );
  return result.data;
}

/**
 * List payment requests with optional filters
 */
export async function listPaymentRequests(
  filters?: {
    customer?: string;
    status?: 'pending' | 'completed' | 'failed';
    from?: Date;
    to?: Date;
    perPage?: number;
    page?: number;
  }
): Promise<{ data: PaystackPaymentRequest[]; meta: { total: number; page: number; perPage: number } }> {
  const params = new URLSearchParams();
  if (filters?.customer) params.append('customer', filters.customer);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.from) params.append('from', filters.from.toISOString().split('T')[0]);
  if (filters?.to) params.append('to', filters.to.toISOString().split('T')[0]);
  if (filters?.perPage) params.append('perPage', filters.perPage.toString());
  if (filters?.page) params.append('page', filters.page.toString());

  const queryString = params.toString();
  const endpoint = queryString ? `/paymentrequest?${queryString}` : '/paymentrequest';

  const result = await paystackRequest<{ data: PaystackPaymentRequest[]; meta: any }>(endpoint, 'GET');
  return { data: result.data.data, meta: result.data.meta };
}

/**
 * Create invoice items from accumulated usage and generate a payment request
 *
 * @param orgId - Organization ID
 * @param meterName - Meter name (e.g., 'api_requests')
 * @param periodStart - Billing period start
 * @param periodEnd - Billing period end
 * @param overageRateCents - Cost per unit in cents (will be converted to kobo)
 * @param includedUnits - Quota included units
 * @param orgName - Organization name for description
 * @param customerEmail - Customer email for invoice
 * @param totalUsage - Total usage in current period
 * @param taxAmountKobo - Optional tax amount in kobo to add as separate tax component
 * @param taxName - Optional tax name (e.g., "VAT 7.5%")
 *
 * @returns Payment request details
 */
export async function generateUsageInvoice(
  orgId: string,
  meterName: string,
  periodStart: Date,
  periodEnd: Date,
  overageRateCents: number,
  includedUnits: number,
  orgName: string,
  customerEmail: string,
  totalUsage: number,
  taxRatePercent?: number,
  taxName?: string
): Promise<PaystackPaymentRequest> {
  // Calculate overage
  const overageUnits = Math.max(0, totalUsage - includedUnits);
  const overageAmountCents = overageUnits * overageRateCents;
  const overageAmountKobo = Math.round(overageAmountCents / 100); // Convert cents to kobo (NGN)

  // Calculate tax if applicable
  let taxAmountKobo: number | undefined;
  if (taxRatePercent && taxRatePercent > 0) {
    const taxAmountCents = Math.round(overageAmountCents * taxRatePercent / 100);
    taxAmountKobo = Math.round(taxAmountCents / 100);
  }

  // Build line items
  const lineItems: Array<{ name: string; amountKobo: number; quantity: number }> = [];

  if (overageAmountKobo > 0) {
    lineItems.push({
      name: `${meterName} overage (${overageUnits} units)`,
      amountKobo: overageAmountKobo,
      quantity: 1,
    });
  }

  // If total usage is 0, no invoice needed
  if (lineItems.length === 0) {
    throw new Error('No billable usage for this period');
  }

  const description = `Usage billing for ${orgName} - ${meterName} (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`;

  // Prepare tax payload if applicable
  const taxPayload = taxAmountKobo && taxName ? [{ name: `${taxName} (${taxRatePercent}%)`, amount: taxAmountKobo }] : undefined;

  // Create payment request in draft mode first
  const paymentRequest = await createPaymentRequest(
    customerEmail,
    description,
    lineItems,
    {
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      draft: true, // Create as draft, can be finalized later
      tax: taxPayload,
      metadata: {
        orgId,
        meterName,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalUsage,
        includedUnits,
        overageUnits,
        ...(taxRatePercent && { taxRatePercent }),
        ...(taxAmountKobo && { taxAmountKobo }),
      },
    }
  );

  return paymentRequest;
}

/**
 * Finalize and send an invoice
 */
export async function finalizeAndSendInvoice(requestCode: string): Promise<PaystackPaymentRequest> {
  const finalized = await finalizePaymentRequest(requestCode);
  const sent = await sendPaymentRequest(requestCode);
  return sent;
}
