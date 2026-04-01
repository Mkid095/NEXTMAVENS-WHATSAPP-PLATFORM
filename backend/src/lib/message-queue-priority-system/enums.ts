/**
 * Message Queue Priority System - Enums and Constants
 */

/**
 * Priority levels for message processing
 * Lower number = higher priority
 */
export enum MessagePriority {
  CRITICAL = 1,   // System alerts, security events
  HIGH = 5,       // Instance status changes
  MEDIUM = 10,    // Message operations
  LOW = 50,       // Analytics and low-priority events
  BACKGROUND = 100 // Maintenance tasks
}

/**
 * Message types that can be queued
 * Maps to priority levels for automatic routing
 */
export enum MessageType {
  MESSAGE_UPSERT = 'message_upsert',
  MESSAGE_STATUS_UPDATE = 'message_status_update',
  MESSAGE_DELETE = 'message_delete',
  INSTANCE_STATUS_UPDATE = 'instance_status_update',
  CONTACT_UPDATE = 'contact_update',
  ANALYTICS_EVENT = 'analytics_event',
  WEBHOOK_EVENT = 'webhook_event',
  DATABASE_CLEANUP = 'database_cleanup',
  CACHE_REFRESH = 'cache_refresh',
  WORKFLOW_STEP = 'workflow_step'
}

// Priority mapping for each message type
export const PRIORITY_MAPPING: Record<MessageType, MessagePriority> = {
  [MessageType.MESSAGE_UPSERT]: MessagePriority.MEDIUM,
  [MessageType.MESSAGE_STATUS_UPDATE]: MessagePriority.HIGH,
  [MessageType.MESSAGE_DELETE]: MessagePriority.MEDIUM,
  [MessageType.INSTANCE_STATUS_UPDATE]: MessagePriority.HIGH,
  [MessageType.CONTACT_UPDATE]: MessagePriority.MEDIUM,
  [MessageType.ANALYTICS_EVENT]: MessagePriority.LOW,
  [MessageType.WEBHOOK_EVENT]: MessagePriority.LOW,
  [MessageType.DATABASE_CLEANUP]: MessagePriority.BACKGROUND,
  [MessageType.CACHE_REFRESH]: MessagePriority.BACKGROUND,
  [MessageType.WORKFLOW_STEP]: MessagePriority.MEDIUM
};

export function getPriorityForType(type: MessageType): MessagePriority {
  return PRIORITY_MAPPING[type] ?? MessagePriority.MEDIUM;
}
