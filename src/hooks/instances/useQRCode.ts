/**
 * QR Code Hooks
 * Generate and poll for QR codes for WhatsApp instance connection
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '../../lib/api';
import { qrKeys, instanceKeys } from '../../lib/queryKeys';
import toast from 'react-hot-toast';
import { calculateBackoff, shouldContinuePolling } from '../../lib/cachedQRBackoff';

export interface InstanceQRData {
  qrCode: string;
  status: string;
  expiresAt?: string;
}

/**
 * Generate QR code for connection
 */
export function useQRCode(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`whatsapp/instances/${instanceId}/connect`);
      return data || null;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: qrKeys.forInstance(instanceId) });
      const previousQR = queryClient.getQueryData(qrKeys.forInstance(instanceId));
      const previousInstance = queryClient.getQueryData(instanceKeys.detail(instanceId));

      // Optimistic: set status to connecting
      queryClient.setQueryData(qrKeys.forInstance(instanceId), () => ({
        qrCode: '',
        status: 'connecting',
      }));

      queryClient.setQueryData(instanceKeys.detail(instanceId), (old: any) => {
        return old ? { ...old, status: 'connecting' } : old;
      });

      return { previousQR, previousInstance };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previousQR) {
        queryClient.setQueryData(qrKeys.forInstance(instanceId), context.previousQR);
      }
      if (context?.previousInstance) {
        queryClient.setQueryData(instanceKeys.detail(instanceId), context.previousInstance);
      }
      toast.error(error.message || 'Failed to generate QR');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: qrKeys.forInstance(instanceId) });
      queryClient.invalidateQueries({ queryKey: instanceKeys.detail(instanceId) });
    },
    onSuccess: () => {
      toast.success('QR code generated! Scan it with your WhatsApp.');
    },
  });
}

/**
 * Cached QR code with exponential backoff polling
 * @deprecated Use useRealtimeQR instead. This hook uses HTTP polling and is less efficient.
 */
export function useCachedQR(instanceId: string, enabled: boolean = true) {
  const retryCountRef = useRef(0);

  return useQuery<InstanceQRData | null, Error>({
    queryKey: qrKeys.forInstance(instanceId),
    queryFn: async (): Promise<InstanceQRData | null> => {
      const { data } = await api.get(`whatsapp/instances/${instanceId}/qr`);
      return data || null;
    },
    staleTime: 0,
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: (query) => {
      if (!enabled) return false;
      const data = query.state.data as any;
      const status = data?.status;

      // Check if we should stop polling (terminal status)
      if (!shouldContinuePolling(status)) {
        retryCountRef.current = 0;
        return false;
      }

      // Still polling - use current retry count for this interval
      const interval = calculateBackoff(retryCountRef.current);
      retryCountRef.current += 1;
      return interval;
    },
    enabled,
  });
}
