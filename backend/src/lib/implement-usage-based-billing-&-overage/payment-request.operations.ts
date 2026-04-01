/**
 * Paystack Payment Request Operations
 * Low-level CRUD operations for payment requests
 */

import { paystackRequest } from './http-client';
import { getOrCreateCustomer } from './customer.client';
import type { PaystackPaymentRequest } from './paystack.types';

/**
 * Create a payment request for a customer
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
    tax?: Array<{ name: string; amount: number }>;
  }
): Promise<PaystackPaymentRequest> {
  const customer = await getOrCreateCustomer(customerEmail);

  const payload: any = {
    customer: customer.customer_code,
    description,
    line_items: lineItems.map(item => ({
      name: item.name,
      amount: item.amountKobo,
      quantity: item.quantity,
    })),
    ...(options?.tax && { tax: options.tax }),
    ...(options?.dueDate && { due_date: options.dueDate.toISOString().split('T')[0] }),
    ...(options?.sendNotification !== undefined && { send_notification: options.sendNotification }),
    ...(options?.draft && { draft: options.draft }),
    ...(options?.metadata && { metadata: options.metadata }),
  };

  const result = await paystackRequest<{ data: PaystackPaymentRequest }>('/paymentrequest', 'POST', payload);
  return result.data.data;
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
  return result.data.data;
}

/**
 * Send a payment request to customer via email
 */
export async function sendPaymentRequest(requestCode: string): Promise<PaystackPaymentRequest> {
  const result = await paystackRequest<{ data: PaystackPaymentRequest }>(
    `/paymentrequest/send/${requestCode}`,
    'POST'
  );
  return result.data.data;
}

/**
 * Get a payment request by ID or code
 */
export async function getPaymentRequest(idOrCode: string | number): Promise<PaystackPaymentRequest> {
  const result = await paystackRequest<{ data: PaystackPaymentRequest }>(
    `/paymentrequest/${idOrCode}`,
    'GET'
  );
  return result.data.data;
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
