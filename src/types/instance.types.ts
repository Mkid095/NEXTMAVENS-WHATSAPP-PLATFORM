/**
 * Instance & Organization Types
 * Types for WhatsApp instances, settings, and organization-level resources
 */

export interface WhatsAppInstance {
  id: string;
  orgId: string;
  name: string;
  evolutionInstanceName?: string;
  evolutionApiKey?: string;
  phoneNumber?: string;
  profileName?: string;
  profilePicture?: string;
  pushName?: string;
  status: InstanceStatus;
  heartbeatStatus?: string;
  lastSeen?: string;
  battery?: number;
  isOnline?: boolean;
  isBusiness?: boolean;
  connectedAt?: string;
  qrCode?: string;
  pairingCode?: string;
  qrExpiresAt?: string;
  settings?: InstanceSettings;
  typebotEnabled?: boolean;
  typebotConfig?: any;
  chatwootEnabled?: boolean;
  chatwootConfig?: any;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEvents?: string[];
  messagesSent?: number;
  messagesReceived?: number;
  apiCalls?: number;
  lastActivityAt?: string;
  parentInstanceId?: string;
  isSubInstance?: boolean;
  clientName?: string;
  clientEmail?: string;
  clientMetadata?: any;
  quotaLimit?: number;
  quotaPeriod?: string;
  quotaUsed?: number;
  quotaResetAt?: string;
  createdAt: string;
  updatedAt?: string;
  isPrimary?: boolean;
  token?: string;
}

export type InstanceStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'QR_READY'
  | 'CONNECTING'
  | 'CREATING'
  | 'FAILED';

export type Period = 'day' | 'week' | 'month';

export interface InstanceSettings {
  rejectCalls?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readReceipts?: boolean;
  readStatus?: boolean;
}

export interface WhatsAppApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
}
