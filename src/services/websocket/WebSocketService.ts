/**
 * WebSocket Service
 *
 * Singleton service managing Socket.IO connection lifecycle.
 * Provides typed event subscriptions and automatic reconnection.
 */

import { io, Socket } from 'socket.io-client';
import { WebSocketEvent, WebSocketEventMap } from '../../types';

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private isConnected = false;
  private static instance: WebSocketService;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Get current connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get socket instance (if connected)
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Connect to WebSocket server with authentication token
   */
  connect(token: string): void {
    if (!token) {
      console.warn('[WebSocketService] Cannot connect: no token provided');
      return;
    }

    if (this.socket?.connected) {
      console.log('[WebSocketService] Already connected');
      return;
    }

    console.log('[WebSocketService] Connecting to', window.location.origin);

    this.socket = io(window.location.origin, {
      path: '/socket.io',
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[WebSocketService] Connected:', this.socket?.id);
      this.isConnected = true;
    });

    this.socket.on('connect_error', (err: any) => {
      console.error('[WebSocketService] Connection error:', err);
      this.isConnected = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocketService] Disconnected:', reason);
      this.isConnected = false;
    });

    // Re-subscribe to all events after reconnect
    this.socket.on('reconnect', () => {
      console.log('[WebSocketService] Reconnected');
      this.isConnected = true;
      this.resubscribeAll();
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  /**
   * Subscribe to an instance's room for targeted updates
   */
  subscribeToInstance(instanceId: string): void {
    if (this.socket?.connected) {
      console.log('[WebSocketService] Subscribing to instance:', instanceId);
      this.socket.emit('join:instance', instanceId);
    }
  }

  /**
   * Unsubscribe from an instance's room
   */
  unsubscribeFromInstance(instanceId: string): void {
    if (this.socket?.connected) {
      console.log('[WebSocketService] Unsubscribing from instance:', instanceId);
      this.socket.emit('leave:instance', instanceId);
    }
  }

  /**
   * Register an event listener
   */
  on<T extends WebSocketEvent>(event: T, callback: (data: WebSocketEventMap[T]) => void): void {
    const socket = this.socket;
    if (!socket) {
      console.warn('[WebSocketService] No socket, listener not added for:', event);
      return;
    }

    socket.on(event, callback as any);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove a specific event listener
   */
  off<T extends WebSocketEvent>(event: T, callback?: (data: WebSocketEventMap[T]) => void): void {
    const socket = this.socket;
    if (!socket) return;

    if (callback) {
      socket.off(event, callback as any);
      this.listeners.get(event)?.delete(callback);
    } else {
      socket.off(event);
      this.listeners.delete(event);
    }
  }

  /**
   * Remove all listeners for an event
   */
  offAll(event?: WebSocketEvent): void {
    const socket = this.socket;
    if (!socket) return;

    if (event) {
      socket.off(event);
      this.listeners.delete(event);
    } else {
      // Remove all listeners
      this.listeners.forEach((_, eventName) => {
        socket.off(eventName);
      });
      this.listeners.clear();
    }
  }

  /**
   * Re-subscribe to all registered events (used after reconnect)
   */
  private resubscribeAll(): void {
    console.log('[WebSocketService] Re-subscribing to', this.listeners.size, 'events');
    // Events automatically re-register with Socket.IO on reconnect
    // This method exists for future manual resubscription logic if needed
  }
}

// Export singleton instance
export const webSocketService = WebSocketService.getInstance();
