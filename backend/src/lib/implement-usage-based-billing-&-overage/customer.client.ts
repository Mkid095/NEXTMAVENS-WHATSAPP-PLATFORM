/**
 * Paystack Customer Client
 * Operations for managing Paystack customers
 */

import { paystackRequest } from './http-client';
import type { PaystackCustomer } from './paystack.types';

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
    const searchResult = await paystackRequest<PaystackCustomer[]>(
      `/customer?email=${encodeURIComponent(email)}`,
      'GET'
    );

    if (searchResult.data && searchResult.data.length > 0) {
      const existing = searchResult.data[0];
      return {
        id: existing.id,
        customer_code: existing.customer_code,
        email: existing.email,
      };
    }
  } catch (error) {
    // If not found (404), continue to create
    if ((error as any).code !== 'resource_not_found') {
      throw error;
    }
  }

  // Customer not found, create new one
  const createData: any = { email };
  if (firstName) createData.first_name = firstName;
  if (lastName) createData.last_name = lastName;
  if (phone) createData.phone = phone;

  const createResult = await paystackRequest<PaystackCustomer>('/customer', 'POST', createData);

  const customer = createResult.data;
  return {
    id: customer.id,
    customer_code: customer.customer_code,
    email: customer.email,
  };
}
