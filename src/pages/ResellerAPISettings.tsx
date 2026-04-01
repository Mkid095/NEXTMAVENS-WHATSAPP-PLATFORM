/**
 * Reseller API Settings - Main container
 */

import React, { useState } from 'react';
import { ResellerHeader } from '../components/ResellerAPISettings/ResellerHeader';
import { TokenDisplay } from '../components/ResellerAPISettings/TokenDisplay';
import { InfoCard } from '../components/ResellerAPISettings/InfoCard';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';

export function ResellerAPISettings() {
  const [tokenToCopy, setTokenToCopy] = useState<string | null>(null);

  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ['reseller-token'],
    queryFn: async () => {
      const response = await api.get('whatsapp/reseller/token');
      return response.data;
    },
    retry: false,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get('whatsapp/reseller/token');
      return response.data;
    },
    onSuccess: () => {
      toast.success('New Reseller JWT token generated');
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate token');
    },
  });

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setTokenToCopy(token);
      toast.success('Token copied to clipboard');
      setTimeout(() => setTokenToCopy(null), 2000);
    } catch (err) {
      toast.error('Failed to copy token');
    }
  };

  return (
    <div className="space-y-8">
      <ResellerHeader />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <TokenDisplay
            token={data?.token}
            isLoading={isLoading}
            error={error}
            tokenToCopy={tokenToCopy}
            onCopy={handleCopy}
            onRegenerate={() => regenerateMutation.mutate()}
            isRegenerating={regenerateMutation.isPending}
          />
        </div>

        <div className="space-y-8">
          <InfoCard />
        </div>
      </div>
    </div>
  );
}
