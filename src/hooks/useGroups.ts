/**
 * Groups Hook - React Query wrapper around GroupsApi
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsService } from '../services/groups';
import { WhatsAppGroup } from '../types';
import { groupKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

export function useGroups(instanceId: string) {
  return useQuery<WhatsAppGroup[], Error>({
    queryKey: groupKeys.byInstance(instanceId),
    queryFn: () => groupsService.fetchByInstance(instanceId),
    enabled: !!instanceId,
  });
}

export function useGroupDetails(groupJid: string) {
  return useQuery<WhatsAppGroup | null, Error>({
    queryKey: groupKeys.detail(groupJid),
    queryFn: () => groupsService.fetchByJid(groupJid),
    enabled: !!groupJid,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { instanceId: string; name: string; participants: string[] }) => groupsService.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: groupKeys.byInstance(data.instanceId) });
      const previous = queryClient.getQueryData(groupKeys.byInstance(data.instanceId));

      // Optimistic add
      const optimisticGroup: WhatsAppGroup = {
        id: `temp-${Date.now()}`,
        instanceId: data.instanceId,
        name: data.name,
        subject: data.name,
        subjectTime: Date.now(),
        description: '',
        ownerJid: '',
        participantsCount: data.participants.length,
        creation: Date.now(),
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData(groupKeys.byInstance(data.instanceId), (old: WhatsAppGroup[] = []) => {
        return [optimisticGroup, ...old];
      });

      return { previous, optimisticId: optimisticGroup.id };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(groupKeys.byInstance(vars.instanceId), context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to create group');
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.byInstance(vars.instanceId) });
    },
    onSuccess: () => {
      toast.success('Group created');
    },
    // Note: onError removed from here; merged above
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupJid: string) => groupsService.delete(groupJid),
    onMutate: async (groupJid) => {
      // For simplicity, cancel and invalidate all group queries across all instances
      await queryClient.cancelQueries({ queryKey: groupKeys.all, exact: false });
      // No optimistic update since we lack instanceId to target specific cache
      return null;
    },
    onError: () => {
      toast.error('Failed to delete group');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all, exact: false });
      toast.success('Group deleted');
    },
  });
}
