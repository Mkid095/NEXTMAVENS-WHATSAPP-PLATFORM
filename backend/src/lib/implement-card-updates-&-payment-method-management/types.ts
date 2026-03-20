/**
 * Payment Method Management Types
 * Manages customer payment methods (cards) integrated with Paystack
 */

export interface PaymentMethod {
  id: string;
  orgId: string;
  authorizationCode: string; // Paystack reusable authorization code
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentMethodInput {
  orgId: string;
  authorizationCode: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

export interface UpdatePaymentMethodInput {
  paymentMethodId: string;
  orgId: string;
  isDefault?: boolean;
}

export interface PaymentMethodSummary {
  id: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface CustomerInfo {
  paystackCustomerCode: string;
  email: string;
 firstName?: string;
  lastName?: string;
}
