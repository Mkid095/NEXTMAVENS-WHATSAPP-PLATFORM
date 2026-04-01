/**
 * Instance API Key Hooks
 * Queries and mutations for managing WhatsApp instance API keys
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { apiKeyKeys } from '../../lib/queryKeys';
import toast from 'react-hot-toast';
import { WhatsAppApiKey } from '../../types';

export function useApiKeys(instanceId: string) {
  return useQuery<WhatsAppApiKey[], Error>({
    queryKey: apiKeyKeys.forInstance(instanceId),
    queryFn: async (): Promise<WhatsAppApiKey[]> => {
      const { data } = await api.get<{ keys: WhatsAppApiKey[] }>(`whatsapp/instances/${instanceId}/keys`);
      return data.keys || [];
    },
    enabled: !!instanceId,
  });
}

export function useCreateApiKey(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyData: { name: string }) => {
      const { data } = await api.post(`whatsapp/instances/${instanceId}/keys`, keyData);
      return data.key || null;
    },
    onMutate: async (keyData) => {
      await queryClient.cancelQueries({ queryKey: apiKeyKeys.forInstance(instanceId) });
      const previous = queryClient.getQueryData(apiKeyKeys.forInstance(instanceId));

      // Optimistic add
      const optimisticKey: WhatsAppApiKey = {
        id: `temp-${Date.now()}`,
        name: keyData.name,
        key: 'xxxx-xxxx-xxxx-xxxx',
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<WhatsAppApiKey[]>(apiKeyKeys.forInstance(instanceId), (old = []) => {
        return [...old, optimisticKey];
      });

      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(apiKeyKeys.forInstance(instanceId), context.previous);
      }
      toast.error(error.message || 'Failed to create API key');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.forInstance(instanceId) });
    },
    onSuccess: () => {
      toast.success('API key created');
    },
  });
}

export function useDeleteApiKey(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      await api.delete(`whatsapp/instances/${instanceId}/keys/${keyId}`);
    },
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: apiKeyKeys.forInstance(instanceId) });
      const previous = queryClient.getQueryData(apiKeyKeys.forInstance(instanceId));

      queryClient.setQueryData<WhatsAppApiKey[]>(apiKeyKeys.forInstance(instanceId), (old = []) => {
        return old.filter(k => k.id !== keyId && k.key !== keyId);
      });

      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(apiKeyKeys.forInstance(instanceId), context.previous);
      }
      toast.error(error.message || 'Failed to delete API key');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.forInstance(instanceId) });
    },
    onSuccess: () => {
      toast.success('API key deleted');
    },
  });
}
