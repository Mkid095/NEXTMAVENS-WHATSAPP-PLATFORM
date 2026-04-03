/**
 * Card Updates & Payment Method Management - Customer Management
 * Manages Paystack customer lifecycle
 */

import { prisma } from '../prisma';
import { paystackRequest } from './paystack.client';
import type { CustomerInfo } from './types';

/**
 * Get or create a Paystack customer for the organization
 */
export async function ensurePaystackCustomer(orgId: string): Promise<CustomerInfo> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, email: true, name: true, paystackCustomerCode: true },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  // If we already have a customer code, return it
  if (org.paystackCustomerCode) {
    return {
      paystackCustomerCode: org.paystackCustomerCode,
      email: org.email,
      firstName: org.name,
    };
  }

  // Create new customer in Paystack
  const customerData = await paystackRequest<{
    id: number;
    email: string;
    customer_code: string;
    createdAt: string;
  }>('/customer', 'POST', {
    email: org.email,
    first_name: org.name,
    // last_name: '',
  });

  // Save customer code to organization
  const updatedOrg = await prisma.organization.update({
    where: { id: orgId },
    data: { paystackCustomerCode: customerData.data.customer_code },
    select: { paystackCustomerCode: true, email: true, name: true },
  });

  return {
    paystackCustomerCode: updatedOrg.paystackCustomerCode,
    email: updatedOrg.email,
    firstName: updatedOrg.name,
  };
}
