/**
 * useRealtimeInstances
 *
 * Provides real-time WhatsApp instances list using WebSocket.
 * Falls back to HTTP fetch if WebSocket disconnected.
 * No polling needed - relies on push updates.
 *
 * Replaces: useInstances
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWebSocket } from './useWebSocket';
import { WhatsAppInstance } from '../types';

/**
 * Fetch all instances (HTTP fallback)
 */
async function fetchInstances(): Promise<WhatsAppInstance[]> {
  const { data } = await api.get<{ instances: WhatsAppInstance[] }>('whatsapp/instances');
  return data.instances || [];
}

/**
 * Hook: Get real-time instances list with WebSocket updates
 */
export function useRealtimeInstances() {
  const queryClient = useQueryClient();
  const { isConnected, on, off } = useWebSocket();

  // Base query - fetches once, relies on WebSocket for updates
  const query = useQuery<WhatsAppInstance[], Error>({
    queryKey: ['whatsapp-instances'],
    queryFn: fetchInstances,
    staleTime: 0, // Always consider stale so we can refetch on reconnect
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // WebSocket event: instance created
  const handleInstanceCreated = useCallback((data: { instance: WhatsAppInstance }) => {
    console.log('[useRealtimeInstances] Instance created:', data.instance.id);

    queryClient.setQueryData<WhatsAppInstance[]>(['whatsapp-instances'], (old?: WhatsAppInstance[]) => {
      // Avoid duplicates
      const exists = old?.some(i => i.id === data.instance.id);
      if (exists) return old;
      return [...(old || []), data.instance];
    });
  }, [queryClient]);

  // WebSocket event: instance deleted
  const handleInstanceDeleted = useCallback((data: { instanceId: string }) => {
    console.log('[useRealtimeInstances] Instance deleted:', data.instanceId);

    queryClient.setQueryData<WhatsAppInstance[]>(['whatsapp-instances'], (old?: WhatsAppInstance[]) => {
      return old?.filter(i => i.id !== data.instanceId) || [];
    });
  }, [queryClient]);

  // WebSocket event: instance status/updated (includes heartbeat updates)
  const handleInstanceUpdated = useCallback((data: {
    instanceId: string;
    status?: WhatsAppInstance['status'];
    heartbeatStatus?: string;
    lastSeen?: string;
  }) => {
    console.log('[useRealtimeInstances] Instance updated:', data.instanceId, data.status);

    queryClient.setQueryData<WhatsAppInstance[]>(['whatsapp-instances'], (old) => {
      const instances = old || [];
      return instances.map(i => {
        if (i.id === data.instanceId) {
          const updated: WhatsAppInstance = {
            ...i,
            ...(data.status ? { status: data.status } : {}),
            ...(data.heartbeatStatus ? { heartbeatStatus: data.heartbeatStatus } : {}),
            ...(data.lastSeen ? { lastSeen: data.lastSeen } : {}),
          };
          return updated;
        }
        return i;
      });
    });
  }, [queryClient]);

  // Subscribe to WebSocket events when connected
  useEffect(() => {
    if (!isConnected) return;

    console.log('[useRealtimeInstances] Subscribing to WebSocket instance events');

    on('whatsapp:instance:created', handleInstanceCreated);
    on('whatsapp:instance:deleted', handleInstanceDeleted);
    on('whatsapp:instance:status', handleInstanceUpdated);

    return () => {
      off('whatsapp:instance:created', handleInstanceCreated);
      off('whatsapp:instance:deleted', handleInstanceDeleted);
      off('whatsapp:instance:status', handleInstanceUpdated);
    };
  }, [isConnected, on, off, handleInstanceCreated, handleInstanceDeleted, handleInstanceUpdated]);

  return query;
}
