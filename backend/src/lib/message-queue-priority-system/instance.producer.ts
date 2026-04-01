/**
 * Message Queue Producer - Instance & Contact Operations
 * Queues instance and contact related jobs
 */

import { addJob } from './operations';
import { MessageType } from './enums';

/**
 * Queue an instance status update
 * Priority: HIGH
 */
export async function queueInstanceStatusUpdate(data: {
  instanceId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  orgId: string;
}): Promise<any> {
  return await addJob(MessageType.INSTANCE_STATUS_UPDATE, { ...data });
}

/**
 * Queue a contact update
 * Priority: MEDIUM
 */
export async function queueContactUpdate(data: {
  contactId: string;
  instanceId: string;
  orgId: string;
  changes: {
    name?: string;
    phone?: string;
    [key: string]: unknown;
  };
}): Promise<any> {
  return await addJob(MessageType.CONTACT_UPDATE, { ...data });
}
