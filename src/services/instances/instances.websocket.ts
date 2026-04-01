/**
 * Instances WebSocket - Real-time instance updates
 */

import { webSocketService } from '../websocket/WebSocketService';
import { WebSocketEvent } from '../../types';

export class InstancesWebSocket {
  subscribeToInstanceUpdates(instanceId: string): void {
    webSocketService.subscribeToInstance(instanceId);
  }

  unsubscribeFromInstanceUpdates(instanceId: string): void {
    webSocketService.unsubscribeFromInstance(instanceId);
  }

  onInstanceCreated(callback: (data: { instance: any }) => void): void {
    webSocketService.on('whatsapp:instance:created', callback);
  }

  offInstanceCreated(callback?: (data: any) => void): void {
    webSocketService.off('whatsapp:instance:created', callback);
  }

  onInstanceDeleted(callback: (data: { instanceId: string }) => void): void {
    webSocketService.on('whatsapp:instance:deleted', callback);
  }

  offInstanceDeleted(callback?: (data: any) => void): void {
    webSocketService.off('whatsapp:instance:deleted', callback);
  }

  onInstanceStatusUpdate(callback: (data: { instanceId: string; status?: string; heartbeatStatus?: string; lastSeen?: string }) => void): void {
    webSocketService.on('whatsapp:instance:status', callback);
  }

  offInstanceStatusUpdate(callback?: (data: any) => void): void {
    webSocketService.off('whatsapp:instance:status', callback);
  }

  isConnected(): boolean {
    return webSocketService.connected;
  }
}
