/**
 * WebSocket Event Constants
 * Central registry of all WebSocket event types for type safety and consistency
 */

export const WS_EVENTS = {
  // Instance events
  INSTANCE_CREATED: 'whatsapp:instance:created',
  INSTANCE_DELETED: 'whatsapp:instance:deleted',
  INSTANCE_STATUS: 'whatsapp:instance:status',
  INSTANCE_QR_UPDATE: 'whatsapp:instance:qr:update',

  // Message events
  MESSAGE_UPSERT: 'whatsapp:message:upsert',
  MESSAGE_UPDATE: 'whatsapp:message:update',
  MESSAGE_DELETE: 'whatsapp:message:delete',

  // Chat events
  CHAT_UPDATE: 'whatsapp:chat:update',
  CHAT_NEW: 'whatsapp:chat:new',

  // Queue events
  QUEUE_UPDATE: 'whatsapp:queue:update',
  QUEUE_ADD: 'whatsapp:queue:add',
  QUEUE_REMOVE: 'whatsapp:queue:remove',

  // Connection events
  CONNECTION_ESTABLISHED: 'connect',
  CONNECTION_DISCONNECTED: 'disconnect',
  CONNECTION_ERROR: 'error',

  // Webhook events
  WEBHOOK_DELIVERY: 'whatsapp:webhook:delivery',
} as const;

export type WebSocketEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
