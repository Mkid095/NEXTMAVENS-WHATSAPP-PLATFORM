/**
 * Chats Service
 *
 * Handles chat-related operations:
 * - Fetch chat list
 * - Real-time chat updates via WebSocket
 */

import { getApiService } from '../api/ApiService';
import { webSocketService } from '../websocket/WebSocketService';
import { WhatsAppChat } from '../../types';

class ChatsService {
  private api = getApiService().getAxios();

  /**
   * Fetch chats for an instance
   */
  async fetchByInstance(instanceId: string): Promise<WhatsAppChat[]> {
    const response = await this.api.get<{ chats: WhatsAppChat[] }>(`whatsapp/instances/${instanceId}/chats`);
    return response.data.chats || [];
  }

  /**
   * Subscribe to real-time chat updates for an instance
   */
  subscribeToChatUpdates(instanceId: string): void {
    webSocketService.subscribeToInstance(instanceId);
  }

  /**
   * Unsubscribe from real-time chat updates
   */
  unsubscribeFromChatUpdates(instanceId: string): void {
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
const chatsService = new ChatsService();
export { chatsService };
