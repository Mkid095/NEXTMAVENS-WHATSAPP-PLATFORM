/**
 * Message Queue Priority System - Base Job Data
 */

import type { MessageType } from './enums';

/**
 * Base job data structure (shared fields)
 */
export interface BaseJobData {
  type: MessageType;
  timestamp?: string;
  source?: string;
}
