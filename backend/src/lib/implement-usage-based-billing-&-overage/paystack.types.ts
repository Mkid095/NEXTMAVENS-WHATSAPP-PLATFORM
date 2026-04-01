/**
 * Paystack Client - Type Definitions
 * Types for Paystack API responses and requests
 */

export interface PaystackCustomer {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  customer_code: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaystackLineItem {
  name: string;
  amount: number; // in kobo (smallest currency unit)
  quantity: number;
}

export interface PaystackPaymentRequest {
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

export interface PaystackInvoice {
  id: number;
  domain: string;
  amount: number;
  currency: string;
  due_date: string;
  description: string;
  line_items: PaystackLineItem[];
  tax?: Array<{ name: string; amount: number }>;
  invoice_number: number;
  request_code: string;
  status: 'pending' | 'completed' | 'failed' | 'partial' | 'overpaid';
  paid: boolean;
  paid_at?: string;
  metadata?: Record<string, any>;
  customer: number | PaystackCustomer;
  created_at: string;
  updated_at: string;
}
