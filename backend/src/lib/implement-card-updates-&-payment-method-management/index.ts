/**
 * Card Updates & Payment Method Management Service
 * Manages customer payment methods (cards) integrated with Paystack
 */

import { prisma } from '../prisma';
import type {
  PaymentMethod,
  CreatePaymentMethodInput,
  UpdatePaymentMethodInput,
  PaymentMethodSummary,
  CustomerInfo,
} from './types';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
}
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

async function paystackRequest<T>(
  endpoint: string,
  method: string = 'POST',
  body?: any
): Promise<{ status: boolean; message: string; data: T }> {
  const url = `${PAYSTACK_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
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
  const data = await response.json() as {
    status: boolean;
    message: string;
    data: T;
    code?: number | string;
  };

  if (!response.ok || data.status !== true) {
    const error = new Error(data.message || 'Paystack API error');
    error.message = data.message || 'Paystack API error';
    (error as any).status = data.status;
    (error as any).code = data.code;
    throw error;
  }

  return data;
}

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

/**
 * Add a new payment method to an organization's Paystack customer
 * Expects authorizationCode from Paystack inline/checkout flow
 */
export async function addPaymentMethod(
  orgId: string,
  authorizationCode: string
): Promise<PaymentMethod> {
  // Ensure customer exists
  const customer = await ensurePaystackCustomer(orgId);
  const customerCode = customer.paystackCustomerCode;

  // Add authorization to Paystack customer
  const result = await paystackRequest<{
    authorization_code: string;
    card: {
      last4: string;
      brand: string;
      exp_month: number;
      exp_year: number;
    };
  }>(`/customer/${customerCode}/payment_method`, 'POST', {
    authorization_code: authorizationCode,
  });

  const card = result.data.card;

  // Create payment method record
  const method = await prisma.paymentMethod.create({
    data: {
      orgId,
      authorizationCode: result.data.authorization_code,
      last4: card.last4,
      brand: card.brand,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      isDefault: false, // new cards not default unless first one
    },
  });

  // If this is the first card for this org, set it as default
  const count = await prisma.paymentMethod.count({ where: { orgId } });
  if (count === 1) {
    await prisma.paymentMethod.update({
      where: { id: method.id },
      data: { isDefault: true },
    });
    method.isDefault = true;
  }

  return method;
}

/**
 * List all payment methods for an organization (from local DB)
 */
export async function listPaymentMethods(orgId: string): Promise<PaymentMethod[]> {
  return prisma.paymentMethod.findMany({
    where: { orgId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * Set a payment method as default for the organization
 */
export async function setDefaultPaymentMethod(
  orgId: string,
  paymentMethodId: string
): Promise<PaymentMethod> {
  // Verify the method belongs to this org
  const method = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, orgId },
  });
  if (!method) {
    throw new Error('Payment method not found');
  }

  // Unset all other defaults for this org
  await prisma.paymentMethod.updateMany({
    where: { orgId, id: { not: paymentMethodId } },
    data: { isDefault: false },
  });

  // Set this one as default
  return prisma.paymentMethod.update({
    where: { id: paymentMethodId },
    data: { isDefault: true },
  });
}

/**
 * Remove a payment method from an organization
 * Also removes it from Paystack customer via API
 */
export async function removePaymentMethod(
  orgId: string,
  paymentMethodId: string
): Promise<void> {
  const method = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, orgId },
  });
  if (!method) {
    throw new Error('Payment method not found');
  }

  // Remove from Paystack
  try {
    await paystackRequest<{ status: boolean }>(
      `/payment_method/${method.authorizationCode}`,
      'DELETE'
    );
  } catch (err) {
    // Log but don't fail - maybe already removed
    console.error('Failed to remove card from Paystack:', err);
  }

  // Remove from local DB
  await prisma.paymentMethod.delete({
    where: { id: paymentMethodId },
  });

  // If we removed the default, set another as default if exists
  const remaining = await prisma.paymentMethod.findFirst({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  });
  if (remaining) {
    await prisma.paymentMethod.update({
      where: { id: remaining.id },
      data: { isDefault: true },
    });
  }
}

/**
 * Get the default payment method for an organization (if any)
 */
export async function getDefaultPaymentMethod(orgId: string): Promise<PaymentMethod | null> {
  return prisma.paymentMethod.findFirst({
    where: { orgId, isDefault: true },
  });
}

/**
 * Health check
 */
export function healthCheck(): boolean {
  return true;
}
