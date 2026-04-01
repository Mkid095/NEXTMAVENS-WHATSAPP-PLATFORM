/**
 * Message Queue Priority System - Instance & Contact Job Types
 */

import type { MessageType } from './enums';
import type { BaseJobData } from './base.types';

/**
 * Job data for WhatsApp instance status updates
 */
export interface InstanceStatusUpdateJobData extends BaseJobData {
  type: MessageType.INSTANCE_STATUS_UPDATE;
  payload: {
    instanceId: string;
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    orgId: string;
  };
}

/**
 * Job data for contact updates
 */
export interface ContactUpdateJobData extends BaseJobData {
  type: MessageType.CONTACT_UPDATE;
  payload: {
    contactId: string;
    instanceId: string;
    orgId: string;
    changes: {
      name?: string;
      phone?: string;
      [key: string]: unknown;
    };
  };
}
