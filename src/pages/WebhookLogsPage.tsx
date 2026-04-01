/**
 * Webhook Logs Page - Main container
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useWebhookDeliveries } from '../hooks';
import { WebhookLogsHeader } from '../components/WebhookLogs/WebhookLogsHeader';
import { InstanceSelector } from '../components/common/InstanceSelector';
import { DeliveriesTable } from '../components/WebhookLogs/DeliveriesTable';
import { Loader2 } from 'lucide-react';

export function WebhookLogsPage() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const limit = 50;

  const { data: deliveries, isLoading: isLoadingDeliveries } = useWebhookDeliveries(selectedInstanceId, limit);

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Select an instance to view webhook logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WebhookLogsHeader limit={limit} />

      <InstanceSelector
        instances={instances || []}
        selectedInstanceId={selectedInstanceId}
        onSelect={setSelectedInstanceId}
      />

      <DeliveriesTable
        deliveries={deliveries || []}
        isLoading={isLoadingDeliveries}
      />
    </div>
  );
}
