/**
 * Group Types
 * Types for WhatsApp groups and participants
 */

export interface WhatsAppGroup {
  id: string;
  instanceId: string;
  name: string;
  subject: string;
  subjectTime: number;
  description?: string;
  ownerJid: string;
  participantsCount: number;
  creation: number;
  isReadOnly?: boolean;
  isAnnounceGroup?: boolean;
  createdAt: string;
}

export interface GroupParticipant {
  id: string;
  jid: string;
  name: string;
  isAdmin: boolean;
  isContact?: boolean;
  pushName?: string;
}
