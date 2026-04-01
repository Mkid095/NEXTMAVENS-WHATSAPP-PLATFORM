/**
 * Chats WebSocket - Real-time chat updates
 */

import { webSocketService } from '../websocket/WebSocketService';

export class ChatsWebSocket {
  subscribeToChatUpdates(instanceId: string): void {
    webSocketService.subscribeToInstance(instanceId);
  }

  unsubscribeFromChatUpdates(instanceId: string): void {
    webSocketService.unsubscribeFromInstance(instanceId);
  }

  onChatUpdate(callback: (data: { instanceId: string; chat: any }) => void): void {
    webSocketService.on('whatsapp:chat:update', callback);
  }

  offChatUpdate(callback?: (data: any) => void): void {
    webSocketService.off('whatsapp:chat:update', callback);
  }

  isConnected(): boolean {
    return webSocketService.connected;
  }
}
