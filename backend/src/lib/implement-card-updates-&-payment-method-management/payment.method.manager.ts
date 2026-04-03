/**
 * Card Updates & Payment Method Management - Payment Method Operations
 * CRUD operations for payment methods
 */

import { prisma } from '../prisma';
import { paystackRequest } from './paystack.client';
import { ensurePaystackCustomer } from './customer.manager';
import type { PaymentMethod } from './types';

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
