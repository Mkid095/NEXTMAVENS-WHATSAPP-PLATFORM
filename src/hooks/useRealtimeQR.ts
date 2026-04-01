/**
 * useRealtimeQR
 *
 * Provides real-time QR code updates for a WhatsApp instance using WebSocket.
 * Falls back to HTTP polling if WebSocket is disconnected.
 *
 * Replaces: useCachedQR
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWebSocket } from './useWebSocket';
import { WS_EVENTS } from '../services/websocket/events';
import { shouldContinuePolling, calculateBackoff } from '../lib/cachedQRBackoff';

export interface InstanceQRData {
  qrCode: string;
  status: string;
  expiresAt?: string;
  pairingCode?: string; // Added for QR wizard display
}

/**
 * Hook: Get QR code with real-time updates via WebSocket
 */
export function useRealtimeQR(instanceId: string, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const retryCountRef = useRef(0);
  const [isPolling, setIsPolling] = useState(false);
  const { isConnected, subscribeToInstance, unsubscribeFromInstance, on, off } = useWebSocket();

  // Base HTTP query (for initial fetch and polling fallback)
  const query = useQuery<InstanceQRData, Error>({
    queryKey: ['whatsapp-instance-qr', instanceId],
    queryFn: async (): Promise<InstanceQRData> => {
      const { data } = await api.get<InstanceQRData>(`whatsapp/instances/${instanceId}/qr`);
      return data;
    },
    enabled: enabled && !!instanceId,
    staleTime: 0, // Real-time via WebSocket - data always stale but kept fresh by WS events
    gcTime: 5 * 60 * 1000, // 5 minutes - keep cached for fallback polling
    refetchInterval: false, // We'll manage polling manually
  });

  // WebSocket event handler for QR updates
  const handleQRUpdate = useCallback((data: { instanceId: string; qrCode: string; status: string; timestamp: number }) => {
    if (data.instanceId !== instanceId) return;

    console.log('[useRealtimeQR] Received QR update via WebSocket:', data.status);

    // Update query cache
    queryClient.setQueryData<InstanceQRData>(['whatsapp-instance-qr', instanceId], (old?: InstanceQRData) => ({
      ...(old || {}),
      qrCode: data.qrCode,
      status: data.status,
      expiresAt: new Date(Date.now() + 60000).toISOString(), // 60s expiry
    }));

    // Reset retry count on update
    retryCountRef.current = 0;
  }, [instanceId, queryClient]);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!isConnected || !instanceId) return;

    console.log('[useRealtimeQR] Subscribing to WebSocket updates');
    subscribeToInstance(instanceId);
    on(WS_EVENTS.INSTANCE_QR_UPDATE, handleQRUpdate);

    return () => {
      unsubscribeFromInstance(instanceId);
      off(WS_EVENTS.INSTANCE_QR_UPDATE, handleQRUpdate);
    };
  }, [isConnected, instanceId, subscribeToInstance, unsubscribeFromInstance, on, off]);

  // HTTP polling fallback when WebSocket disconnected
  useEffect(() => {
    if (!enabled || !instanceId || isConnected) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    let intervalId: NodeJS.Timeout;

    const poll = async () => {
      if (!shouldContinuePolling(query.data?.status)) {
        clearInterval(intervalId);
        setIsPolling(false);
        retryCountRef.current = 0;
        return;
      }

      const interval = calculateBackoff(retryCountRef.current);
      await query.refetch();
      retryCountRef.current += 1;

      // Schedule next poll
      intervalId = setTimeout(poll, interval);
    };

    // Start polling after initial delay
    intervalId = setTimeout(poll, calculateBackoff(retryCountRef.current));

    return () => {
      clearTimeout(intervalId);
      retryCountRef.current = 0;
    };
  }, [enabled, instanceId, isConnected, query, query.data?.status]);

  return {
    ...query,
    isPolling,
    isWebSocketConnected: isConnected,
  };
}
