/**
 * Chat & Message Types
 * Types for conversations, messages, and real-time events
 */

import { InstanceStatus } from './instance.types';

export interface WhatsAppChat {
  id: string;
  chat_id: string;
  name: string;
  phone?: string;
  avatar?: string;
  isGroup: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  lastMessage?: string;
  lastMessageTime?: number;
  last_message_at?: string;
  unreadCount: number;
  unread_count?: number;
  profilePicUrl?: string;
}

export interface WhatsAppMessage {
  id: string;
  messageId?: string;
  from: string;
  to: string;
  body: string;
  type: string;
  timestamp: number;
  createdAt?: string;
  fromMe: boolean;
  mediaUrl?: string;
  content?: any;
}

export interface WebSocketEventMap {
  'whatsapp:message:upsert': { message: WhatsAppMessage };
  'whatsapp:message:update': { messageId: string; updates: Partial<WhatsAppMessage> };
  'whatsapp:message:delete': { messageId: string };
  'whatsapp:instance:status': { instanceId: string; status?: InstanceStatus };
  'whatsapp:instance:qr:update': { instanceId: string; qrCode?: string; status?: string; timestamp?: number; isFresh?: boolean };
  'whatsapp:queue:update': { instanceId: string; queue: any[] };
  'whatsapp:chat:update': { instanceId: string; chat: WhatsAppChat };
  'whatsapp:instance:created': { instance: any };
  'whatsapp:instance:deleted': { instanceId: string };
  'whatsapp:message:delivery': any;
  'whatsapp:message:ack': any;
}

export type WebSocketEvent = keyof WebSocketEventMap;
