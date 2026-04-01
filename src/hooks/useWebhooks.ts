/**
 * Webhooks Hook
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webhooksService } from '../services/webhooks';
import { WhatsAppWebhook, WebhookDelivery } from '../types';
import { webhookKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

export function useWebhooks(instanceId: string | null) {
  return useQuery<WhatsAppWebhook[], Error>({
    queryKey: instanceId ? webhookKeys.config(instanceId) : ['webhooks'],
    queryFn: () => webhooksService.fetchByInstance(instanceId!),
    enabled: !!instanceId,
  });
}

export function useUpdateWebhook(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; enabled?: boolean; byEvents?: boolean; base64?: boolean; events?: string[] }) =>
      webhooksService.upsert(instanceId, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: webhookKeys.config(instanceId) });
      const previous = queryClient.getQueryData(webhookKeys.config(instanceId));

      // Optimistic update: merge new config
      queryClient.setQueryData(webhookKeys.config(instanceId), (old: WhatsAppWebhook[] = []) => {
        // Webhook config is typically a single item per instance
        const newWebhook: WhatsAppWebhook = {
          id: `temp-${Date.now()}`,
          url: data.url,
          enabled: data.enabled ?? true,
          events: data.events || [],
          base64: data.base64 ?? false,
          byEvents: data.byEvents ?? false,
        };
        return [newWebhook];
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(webhookKeys.config(instanceId), context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to update webhook');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.config(instanceId) });
    },
    onSuccess: () => {
      toast.success('Webhook updated');
    },
  });
}

export function useWebhookDeliveries(instanceId: string | null, limit: number = 50) {
  return useQuery<WebhookDelivery[], Error>({
    queryKey: instanceId ? webhookKeys.deliveries(instanceId) : ['webhook-deliveries'],
    queryFn: () => webhooksService.fetchDeliveries(instanceId!, limit),
    enabled: !!instanceId,
  });
}
