/**
 * useRealtimeStatus
 *
 * Provides real-time status updates for a WhatsApp instance using WebSocket.
 * Falls back to HTTP polling if WebSocket is disconnected.
 */

import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWebSocket } from './useWebSocket';
import { WS_EVENTS } from '../services/websocket/events';

export interface InstanceStatusData {
  status: string;
  heartbeatStatus?: string;
  lastSeen?: string;
}

/**
 * Hook: Get instance status with real-time updates via WebSocket
 */
export function useRealtimeStatus(instanceId: string, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { isConnected, subscribeToInstance, unsubscribeFromInstance, on, off } = useWebSocket();

  // Base HTTP query
  const query = useQuery<InstanceStatusData, Error>({
    queryKey: ['whatsapp-instance-status', instanceId],
    queryFn: async (): Promise<InstanceStatusData> => {
      const { data } = await api.get<InstanceStatusData>(`whatsapp/instances/${instanceId}/status`);
      return data;
    },
    enabled: enabled && !!instanceId,
    staleTime: 0, // Real-time via WebSocket - data always stale but kept fresh by WS events
    gcTime: 5 * 60 * 1000, // 5 minutes - keep cached for fallback polling
    refetchInterval: false,
  });

  // WebSocket event handler for status updates
  const handleStatusUpdate = useCallback((data: { instanceId: string; status: string; heartbeatStatus?: string; lastSeen?: string }) => {
    if (data.instanceId !== instanceId) return;

    console.log('[useRealtimeStatus] Received status update via WebSocket:', data.status);

    queryClient.setQueryData<InstanceStatusData>(['whatsapp-instance-status', instanceId], (old?: InstanceStatusData) => ({
      ...(old || {}),
      status: data.status,
      heartbeatStatus: data.heartbeatStatus || old?.heartbeatStatus || 'UNKNOWN',
      lastSeen: data.lastSeen || old?.lastSeen || new Date().toISOString(),
    }));
  }, [instanceId, queryClient]);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!isConnected || !instanceId) return;

    subscribeToInstance(instanceId);
    on(WS_EVENTS.INSTANCE_STATUS, handleStatusUpdate);

    return () => {
      unsubscribeFromInstance(instanceId);
      off(WS_EVENTS.INSTANCE_STATUS, handleStatusUpdate);
    };
  }, [isConnected, instanceId, subscribeToInstance, unsubscribeFromInstance, on, off]);

  // HTTP polling fallback when WebSocket disconnected
  useEffect(() => {
    if (!enabled || !instanceId || isConnected) {
      return;
    }

    const intervalId = setInterval(() => {
      query.refetch();
    }, 10000);

    // Start polling immediately after disconnect (with small delay)
    const initialTimeout = setTimeout(() => {
      query.refetch();
    }, 2000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(initialTimeout);
    };
  }, [enabled, instanceId, isConnected, query]);

  return {
    ...query,
    isWebSocketConnected: isConnected,
  };
}
