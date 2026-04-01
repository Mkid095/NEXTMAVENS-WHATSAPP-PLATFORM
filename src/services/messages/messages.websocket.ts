/**
 * Messages WebSocket - Real-time message updates
 */

import { webSocketService } from '../websocket/WebSocketService';
import { WS_EVENTS } from '../websocket/events';

export class MessagesWebSocket {
  subscribeToMessageUpdates(instanceId: string): void {
    webSocketService.subscribeToInstance(instanceId);
  }

  unsubscribeFromMessageUpdates(instanceId: string): void {
    webSocketService.unsubscribeFromInstance(instanceId);
  }

  onMessageUpsert(callback: (data: { message: any }) => void): void {
    webSocketService.on(WS_EVENTS.MESSAGE_UPSERT, callback);
  }

  offMessageUpsert(callback?: (data: any) => void): void {
    webSocketService.off(WS_EVENTS.MESSAGE_UPSERT, callback);
  }

  onMessageUpdate(callback: (data: { messageId: string; updates: any }) => void): void {
    webSocketService.on(WS_EVENTS.MESSAGE_UPDATE, callback);
  }

  offMessageUpdate(callback?: (data: any) => void): void {
    webSocketService.off(WS_EVENTS.MESSAGE_UPDATE, callback);
  }

  onMessageDelete(callback: (data: { messageId: string }) => void): void {
    webSocketService.on(WS_EVENTS.MESSAGE_DELETE, callback);
  }

  offMessageDelete(callback?: (data: any) => void): void {
    webSocketService.off(WS_EVENTS.MESSAGE_DELETE, callback);
  }

  isConnected(): boolean {
    return webSocketService.connected;
  }
}
