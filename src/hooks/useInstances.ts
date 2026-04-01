/**
 * Instances Hook - React Query wrapper around InstancesApi
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { instancesService } from '../services/instances';
import { webSocketService } from '../services/websocket';
import { WS_EVENTS } from '../services/websocket/events';
import { WhatsAppInstance, InstanceStatus } from '../types';
import { instanceKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

export function useInstances() {
  return useQuery<WhatsAppInstance[], Error>({
    queryKey: instanceKeys.all,
    queryFn: () => instancesService.fetchAll(),
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useInstance(id: string) {
  return useQuery<WhatsAppInstance | null, Error>({
    queryKey: instanceKeys.detail(id),
    queryFn: () => instancesService.fetchById(id),
    enabled: !!id,
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; webhookUrl?: string }) => instancesService.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: instanceKeys.all });
      const previous = queryClient.getQueryData(instanceKeys.all);

      // Create optimistic instance with temporary ID
      const optimisticInstance: WhatsAppInstance = {
        id: `temp-${Date.now()}`,
        orgId: '', // will be set by server
        name: data.name,
        status: 'CREATING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Optional fields can be omitted
      };

      queryClient.setQueryData(instanceKeys.all, (old: WhatsAppInstance[] = []) => {
        return [optimisticInstance, ...old];
      });

      return { previous, optimisticId: optimisticInstance.id };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(instanceKeys.all, context.previous);
      }
      toast.error(error.message || 'Failed to create instance');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all });
    },
    onSuccess: () => {
      toast.success('Instance created');
    },
  });
}

export function useConnectInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => instancesService.connect(instanceId),
    onMutate: async (instanceId) => {
      await queryClient.cancelQueries({ queryKey: instanceKeys.detail(instanceId) });
      await queryClient.cancelQueries({ queryKey: instanceKeys.all });

      const previousDetail = queryClient.getQueryData(instanceKeys.detail(instanceId));
      const previousAll = queryClient.getQueryData(instanceKeys.all);

      // Optimistic status update
      queryClient.setQueryData(instanceKeys.detail(instanceId), (old: WhatsAppInstance | null | undefined) => {
        return old ? { ...old, status: 'connecting' } : old;
      });

      queryClient.setQueryData(instanceKeys.all, (old: WhatsAppInstance[] = []) => {
        return old.map(inst =>
          inst.id === instanceId ? { ...inst, status: 'connecting' as const } : inst
        );
      });

      return { previousDetail, previousAll };
    },
    onError: (error: any, instanceId, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(instanceKeys.detail(instanceId), context.previousDetail);
      }
      if (context?.previousAll) {
        queryClient.setQueryData(instanceKeys.all, context.previousAll);
      }
      toast.error(error.message || 'Failed to connect');
    },
    onSettled: (_data, _error, instanceId) => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.detail(instanceId) });
      queryClient.invalidateQueries({ queryKey: instanceKeys.all });
    },
    onSuccess: () => {
      toast.success('QR code generated');
    },
  });
}

export function useDisconnectInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => instancesService.disconnect(instanceId),
    onMutate: async (instanceId) => {
      await queryClient.cancelQueries({ queryKey: instanceKeys.detail(instanceId) });
      await queryClient.cancelQueries({ queryKey: instanceKeys.all });

      const previousDetail = queryClient.getQueryData(instanceKeys.detail(instanceId));
      const previousAll = queryClient.getQueryData(instanceKeys.all);

      // Optimistic status update
      queryClient.setQueryData(instanceKeys.detail(instanceId), (old: WhatsAppInstance | null | undefined) => {
        return old ? { ...old, status: 'disconnected' } : old;
      });

      queryClient.setQueryData(instanceKeys.all, (old: WhatsAppInstance[] = []) => {
        return old.map(inst =>
          inst.id === instanceId ? { ...inst, status: 'disconnected' as const } : inst
        );
      });

      return { previousDetail, previousAll };
    },
    onError: (error: any, instanceId, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(instanceKeys.detail(instanceId), context.previousDetail);
      }
      if (context?.previousAll) {
        queryClient.setQueryData(instanceKeys.all, context.previousAll);
      }
      toast.error(error.message || 'Failed to disconnect');
    },
    onSettled: (_data, _error, instanceId) => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.detail(instanceId) });
      queryClient.invalidateQueries({ queryKey: instanceKeys.all });
    },
    onSuccess: () => {
      toast.success('Instance disconnected');
    },
  });
}

export function useDeleteInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => instancesService.delete(instanceId),
    onMutate: async (instanceId) => {
      await queryClient.cancelQueries({ queryKey: instanceKeys.all });
      const previous = queryClient.getQueryData(instanceKeys.all);

      // Optimistic remove
      queryClient.setQueryData(instanceKeys.all, (old: WhatsAppInstance[] = []) => {
        return old.filter(i => i.id !== instanceId);
      });

      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(instanceKeys.all, context.previous);
      }
      toast.error(error.message || 'Failed to delete instance');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all });
    },
    onSuccess: () => {
      toast.success('Instance deleted');
    },
  });
}

export function useRealtimeInstances() {
  const query = useInstances();
  const queryClient = useQueryClient();

  // WebSocket event handlers
  const handleInstanceCreated = (data: { instance: WhatsAppInstance }) => {
    queryClient.setQueryData<WhatsAppInstance[]>(instanceKeys.all, (old = []) => {
      if (old.some(i => i.id === data.instance.id)) return old;
      return [data.instance, ...old];
    });
  };

  const handleInstanceDeleted = (data: { instanceId: string }) => {
    queryClient.setQueryData<WhatsAppInstance[]>(instanceKeys.all, (old = []) => {
      return old.filter(i => i.id !== data.instanceId);
    });
  };

  const handleInstanceUpdated = (data: { instanceId: string; status?: string; heartbeatStatus?: string; lastSeen?: string }) => {
    queryClient.setQueryData<WhatsAppInstance[]>(instanceKeys.all, (old = []) => {
      return old.map(i => {
        if (i.id === data.instanceId) {
          const updated = { ...i } as WhatsAppInstance;
          if (data.status) {
            updated.status = data.status as InstanceStatus;
          }
          if (data.heartbeatStatus) {
            updated.heartbeatStatus = data.heartbeatStatus;
          }
          if (data.lastSeen) {
            updated.lastSeen = data.lastSeen;
          }
          return updated;
        }
        return i;
      });
    });
  };

  // Subscribe to WebSocket events on mount
  useEffect(() => {
    if (!webSocketService.connected) return;
    webSocketService.on(WS_EVENTS.INSTANCE_CREATED, handleInstanceCreated);
    webSocketService.on(WS_EVENTS.INSTANCE_DELETED, handleInstanceDeleted);
    webSocketService.on(WS_EVENTS.INSTANCE_STATUS, handleInstanceUpdated);
    return () => {
      webSocketService.off(WS_EVENTS.INSTANCE_CREATED, handleInstanceCreated);
      webSocketService.off(WS_EVENTS.INSTANCE_DELETED, handleInstanceDeleted);
      webSocketService.off(WS_EVENTS.INSTANCE_STATUS, handleInstanceUpdated);
    };
  }, []);

  return query;
}
