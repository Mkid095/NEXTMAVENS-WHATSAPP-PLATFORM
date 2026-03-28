/**
 * Socket.IO Client Singleton
 *
 * Manages a single WebSocket connection to the backend.
 * Automatically reconnects and provides event subscription helpers.
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace(/^http/, 'ws') || 'ws://localhost:3000';

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

/**
 * Get the singleton socket instance, connecting if needed
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Connect to Socket.IO server with JWT token
 */
export function connectSocket(token: string): Promise<Socket> {
  if (socket?.connected) {
    return Promise.resolve(socket);
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = new Promise((resolve, reject) => {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
      resolve(socket);
    });

    socket.on('connect_error', (err: any) => {
      const isAuthError = err.data?.code === 'TOKEN_EXPIRED' || err.message === 'unauthorized';
      if (isAuthError) {
        // Force logout on auth error
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
      reject(err);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      if (reason !== 'io client disconnect') {
        // Automatic reconnection is handled by socket.io
      }
    });
  });

  return connectPromise;
}

/**
 * Disconnect socket (logout)
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    connectPromise = null;
  }
}

/**
 * Subscribe to a specific instance for real-time updates
 */
export function subscribeToInstance(instanceId: string): void {
  if (socket?.connected) {
    socket.emit('join:instance', instanceId);
  }
}

/**
 * Unsubscribe from an instance
 */
export function unsubscribeFromInstance(instanceId: string): void {
  if (socket?.connected) {
    socket.emit('leave:instance', instanceId);
  }
}

/**
 * Listen for new messages
 */
export function onMessage(callback: (msg: any) => void): void {
  socket?.on('whatsapp:message:upsert', callback);
}

/**
 * Listen for message updates (status changes)
 */
export function onMessageUpdate(callback: (update: any) => void): void {
  socket?.on('whatsapp:message:update', callback);
}

/**
 * Listen for message deletions
 */
export function onMessageDelete(callback: (data: { id: string; chatId: string }) => void): void {
  socket?.on('whatsapp:message:delete', callback);
}

/**
 * Listen for instance status changes
 */
export function onInstanceStatus(callback: (status: { instanceId: string; status: string }) => void): void {
  socket?.on('whatsapp:instance:status', callback);
}

/**
 * Listen for QR code updates (refresh/renewal)
 */
export function onQRCodeUpdate(callback: (data: { instanceId: string; qrCode: string; status?: string; timestamp?: number }) => void): void {
  socket?.on('whatsapp:instance:qr:update', callback);
}

/**
 * Remove all listeners (cleanup)
 */
export function removeAllListeners(): void {
  socket?.removeAllListeners();
}
