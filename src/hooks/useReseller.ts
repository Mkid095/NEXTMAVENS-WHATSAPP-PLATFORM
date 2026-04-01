/**
 * Reseller Hook - Sub-instance management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resellerService } from '../services/reseller';
import { subInstanceKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

export function useResellerToken() {
  return useQuery({
    queryKey: ['reseller-token'],
    queryFn: () => resellerService.fetchToken(),
    retry: false,
  });
}

export function useSubInstances(parentInstanceId: string) {
  return useQuery({
    queryKey: subInstanceKeys.forParent(parentInstanceId),
    queryFn: () => resellerService.fetchSubInstances(parentInstanceId),
    enabled: !!parentInstanceId,
  });
}

export function useCreateSubInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { parentInstanceId: string; name: string; clientName?: string; clientEmail?: string; webhookUrl?: string; quotaLimit?: number; quotaPeriod?: string }) =>
      resellerService.createSubInstance(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: subInstanceKeys.forParent(data.parentInstanceId) });
      const previous = queryClient.getQueryData(subInstanceKeys.forParent(data.parentInstanceId));

      // Optimistic add
      const optimisticSubInstance = {
        id: `temp-${Date.now()}`,
        name: data.name,
        instanceId: `temp-${Date.now()}`,
        parentInstanceId: data.parentInstanceId,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        webhookUrl: data.webhookUrl,
        status: 'creating',
        quotaLimit: data.quotaLimit,
        quotaPeriod: data.quotaPeriod,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(subInstanceKeys.forParent(data.parentInstanceId), (old: any[] = []) => {
        return [...old, optimisticSubInstance];
      });

      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(subInstanceKeys.forParent(vars.parentInstanceId), context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to create sub-instance');
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: subInstanceKeys.forParent(vars.parentInstanceId) });
    },
    onSuccess: () => {
      toast.success('Sub-instance created');
    },
  });
}

export function useDeleteSubInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subInstanceId: string) => resellerService.deleteSubInstance(subInstanceId),
    onMutate: async (subInstanceId) => {
      await queryClient.cancelQueries({ queryKey: subInstanceKeys.all });
      const previous = queryClient.getQueryData(subInstanceKeys.all);
      queryClient.setQueryData(subInstanceKeys.all, (old: any[] = []) => {
        return old.filter(si => si.id !== subInstanceId);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(subInstanceKeys.all, context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to delete sub-instance');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: subInstanceKeys.all });
    },
    onSuccess: () => {
      toast.success('Sub-instance deleted');
    },
  });
}
