/**
 * Status Change Reason Enum
 * Reasons for status changes - used for audit trail and debugging
 */

export enum StatusChangeReason {
  CREATION = 'creation',                 // Initial status when message created
  QUEUE_PROCESSING = 'queue',            // Status changed during queue processing
  WEBHOOK_UPDATE = 'webhook',            // Status updated from Evolution API webhook
  ADMIN_MANUAL = 'admin',                // Manual admin update via API
  DLQ_TRANSFER = 'dlq',                  // Message moved to DLQ (FAILED)
  RETRY_EXHAUSTED = 'retry_exhausted',   // Max retries reached
  AUTOMATIC_RECOVERY = 'automatic_recovery', // System auto-recovery action
  CANCELLATION = 'cancellation'          // Message cancelled by admin/user
}
