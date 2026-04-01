/**
 * Sub-Instance & Reseller Types
 * Types for multi-tenant/reseller functionality
 */

import { WhatsAppInstance } from './instance.types';

export interface SubInstance extends Omit<WhatsAppInstance, 'isSubInstance' | 'parentInstanceId'> {
  isSubInstance: true;
  parentInstanceId: string;
  clientName?: string;
  clientEmail?: string;
  quotaLimit?: number;
  quotaUsed: number;
  quotaPeriod?: string;
}

export interface ResellerToken {
  token: string;
  expiresAt?: string;
}

export interface CreateSubInstanceData {
  parentInstanceId: string;
  name: string;
  clientName?: string;
  clientEmail?: string;
  webhookUrl?: string;
  quotaLimit?: number;
  quotaPeriod?: string;
}
