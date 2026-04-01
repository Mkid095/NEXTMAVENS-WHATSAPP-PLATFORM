/**
 * Agent & Queue Types
 * Types for agent management and chat queue
 */

export interface WhatsAppAgent {
  id: string;
  instanceId: string;
  name: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  avatar?: string;
  createdAt: string;
}

export interface ChatAssignment {
  id: string;
  chatJid: string;
  agentId: string;
  assignedAt: string;
}
