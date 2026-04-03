/**
 * Card Updates & Payment Method Management Service
 * Manages customer payment methods (cards) integrated with Paystack
 *
 * Barrel export - functionality split into focused modules.
 */

// Types
export type {
  PaymentMethod,
  CreatePaymentMethodInput,
  UpdatePaymentMethodInput,
  PaymentMethodSummary,
  CustomerInfo,
} from './types';

// Paystack client
export { paystackRequest, healthCheck } from './paystack.client';

// Customer management
export { ensurePaystackCustomer } from './customer.manager';

// Payment method operations
export {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
  removePaymentMethod,
  getDefaultPaymentMethod,
} from './payment.method.manager';
