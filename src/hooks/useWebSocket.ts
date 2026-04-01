import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from './useAuth';
import { WebSocketEvent } from '../types/chat.types';

const SOCKET_URL = window.location.origin;

export function useWebSocket() {
  const token = getToken();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<Function>>>(new Map());

  // Connect to Socket.IO server
  const connect = useCallback(() => {
    if (!token) {
      console.log('[WebSocket] No token, skipping connect');
      return;
    }

    if (socketRef.current?.connected) {
      console.log('[WebSocket] Already connected');
      return;
    }

    console.log('[WebSocket] Connecting to', SOCKET_URL);

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('connect_error', (err: any) => {
      console.error('[WebSocket] Connection error:', err);
      const isAuthError = err.data?.code === 'TOKEN_EXPIRED' || err.message === 'unauthorized';
      if (isAuthError) {
        console.log('[WebSocket] Auth error detected - you may need to re-login');
        // Note: auto-logout disabled to avoid circular dependency
        // Components should monitor isConnected and token validity
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setIsConnected(false);
    });

    socketRef.current = socket;
  }, [token]);

  // Disconnect from Socket.IO server
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Subscribe to an instance's room
  const subscribeToInstance = useCallback((instanceId: string) => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Subscribing to instance:', instanceId);
      socketRef.current.emit('join:instance', instanceId);
    }
  }, []);

  // Unsubscribe from an instance's room
  const unsubscribeFromInstance = useCallback((instanceId: string) => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Unsubscribing from instance:', instanceId);
      socketRef.current.emit('leave:instance', instanceId);
    }
  }, []);

  // Add event listener
  const on = useCallback((event: WebSocketEvent, callback: (data: any) => void) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn('[WebSocket] No socket, listener not added');
      return;
    }

    socket.on(event, callback);

    // Store for cleanup
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
  }, []);

  // Remove event listener
  const off = useCallback((event: WebSocketEvent, callback?: (data: any) => void) => {
    const socket = socketRef.current;
    if (!socket) return;

    if (callback) {
      socket.off(event, callback);
      listenersRef.current.get(event)?.delete(callback);
    } else {
      socket.off(event);
      listenersRef.current.delete(event);
    }
  }, []);

  // Initialize connection on mount when authenticated
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      // Cleanup: disconnect and remove all listeners
      disconnect();
      listenersRef.current.clear();
    };
  }, [token, connect, disconnect]);

  // Reconnect on token change (e.g., after refresh)
  useEffect(() => {
    if (token && socketRef.current?.connected) {
      disconnect();
      setTimeout(connect, 100);
    }
  }, [token, connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    subscribeToInstance,
    unsubscribeFromInstance,
    on,
    off,
    socket: socketRef.current,
  };
}
