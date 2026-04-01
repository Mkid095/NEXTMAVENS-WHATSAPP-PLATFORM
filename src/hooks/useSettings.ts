/**
 * Settings Hook
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../services/settings';
import { instanceKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

export function useUpdateInstance(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => settingsService.api.updateInstance(instanceId, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: instanceKeys.all });
      await queryClient.cancelQueries({ queryKey: instanceKeys.detail(instanceId) });

      const previousInstances = queryClient.getQueryData(instanceKeys.all);
      const previousInstance = queryClient.getQueryData(instanceKeys.detail(instanceId));

      // Optimistic update
      queryClient.setQueryData(instanceKeys.all, (old: any[]) => {
        return old?.map((inst) =>
          inst.id === instanceId ? { ...inst, ...data } : inst
        ) || [];
      });

      queryClient.setQueryData(instanceKeys.detail(instanceId), (old: any) => {
        return old ? { ...old, ...data } : old;
      });

      return { previousInstances, previousInstance };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previousInstances) {
        queryClient.setQueryData(instanceKeys.all, context.previousInstances);
      }
      if (context?.previousInstance) {
        queryClient.setQueryData(instanceKeys.detail(instanceId), context.previousInstance);
      }
      toast.error(error.message || 'Failed to update instance');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all });
      queryClient.invalidateQueries({ queryKey: instanceKeys.detail(instanceId) });
    },
    onSuccess: () => {
      toast.success('Instance updated');
    },
  });
}

export function useUpdateProfile(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, status }: { name?: string; status?: string }) => {
      if (name) return settingsService.api.updateProfileName(instanceId, name);
      if (status) return settingsService.api.updateProfileStatus(instanceId, status);
      return Promise.resolve();
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: instanceKeys.detail(instanceId) });
      const previous = queryClient.getQueryData(instanceKeys.detail(instanceId));

      // Optimistic update
      queryClient.setQueryData(instanceKeys.detail(instanceId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          ...(vars.name && { profileName: vars.name }),
          ...(vars.status && { profileStatus: vars.status }),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(instanceKeys.detail(instanceId), context.previous);
      }
      toast.error('Failed to update profile');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.detail(instanceId) });
      queryClient.invalidateQueries({ queryKey: instanceKeys.all });
    },
    onSuccess: () => {
      toast.success('Profile updated');
    },
  });
}
