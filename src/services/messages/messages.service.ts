/**
 * Messages Service
 *
 * Handles message operations:
 * - Fetch messages for a chat
 * - Send messages (text, media)
 * - Mark as read
 * - Real-time message updates via WebSocket
 */

import { getApiService } from '../api/ApiService';
import { webSocketService } from '../websocket/WebSocketService';
import { WhatsAppMessage } from '../../types';

interface SendMessagePayload {
  chatJid: string;
  message: string;
  type?: 'text';
  mediaUrl?: string;
  quotedMessageId?: string;
}

interface MarkReadPayload {
  keys: Array<{ remoteJid: string; fromMe: boolean }>;
}

class MessagesService {
  private api = getApiService().getAxios();

  /**
   * Fetch messages for a chat
   */
  async fetchByChat(instanceId: string, chatJid: string): Promise<WhatsAppMessage[]> {
    const response = await this.api.get<{ messages: WhatsAppMessage[] }>(
      `whatsapp/instances/${instanceId}/chats/${chatJid}/messages`
    );
    return response.data.messages || [];
  }

  /**
   * Send a text message
   */
  async send(instanceId: string, payload: SendMessagePayload): Promise<WhatsAppMessage> {
    const { chatJid, message, type, mediaUrl } = payload;

    const requestBody: any = {
      number: chatJid,
      text: message,
    };

    if (mediaUrl) {
      requestBody.media = mediaUrl;
      requestBody.type = type || 'document';
    }

    const response = await this.api.post<{ message: WhatsAppMessage }>(
      `whatsapp/instances/${instanceId}/send`,
      requestBody
    );
    return response.data.message;
  }

  /**
   * Mark messages as read
   */
  async markRead(instanceId: string, payload: MarkReadPayload): Promise<void> {
    await this.api.post<null>(`whatsapp/instances/${instanceId}/chats/read`, payload);
  }

  /**
   * Subscribe to real-time message updates for an instance
   */
  subscribeToMessageUpdates(instanceId: string): void {
    webSocketService.subscribeToInstance(instanceId);
  }

  /**
   * Unsubscribe from real-time message updates
   */
  unsubscribeFromMessageUpdates(instanceId: string): void {
    webSocketService.unsubscribeFromInstance(instanceId);
  }

  /**
   * Get WebSocket connection status
   */
  isWebSocketConnected(): boolean {
    return webSocketService.connected;
  }
}

// Export singleton
const messagesService = new MessagesService();
export { messagesService };
