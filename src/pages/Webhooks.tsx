/**
 * Webhooks Page - Main container for webhook configuration
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useWebhooks, useUpdateWebhook } from '../hooks';
import { WebhooksHeader } from '../components/WebhooksConfig/WebhooksHeader';
import { WebhookConfigForm } from '../components/WebhooksConfig/WebhookConfigForm';
import { WebhookSecurityInfo } from '../components/WebhooksConfig/WebhookSecurityInfo';
import { Loader2 } from 'lucide-react';

const AVAILABLE_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
  'CONTACTS_UPSERT',
  'CHATS_UPSERT',
  'GROUPS_UPSERT',
  'CALL'
];

export function Webhooks() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const { data: webhooks, isLoading: isLoadingWebhooks } = useWebhooks(selectedInstanceId);
  const updateWebhook = useUpdateWebhook(selectedInstanceId || '');

  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isBase64, setIsBase64] = useState(false);
  const [isByEvents, setIsByEvents] = useState(true);

  useEffect(() => {
    if (instances && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      if (firstConnected) setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    if (webhooks && webhooks.length > 0) {
      const webhook = webhooks[0];
      setWebhookUrl(webhook.url);
      setSelectedEvents(webhook.events || []);
      setIsEnabled(webhook.enabled);
      setIsBase64(webhook.base64);
      setIsByEvents(webhook.byEvents);
    } else {
      setWebhookUrl('');
      setSelectedEvents([]);
      setIsEnabled(true);
      setIsBase64(false);
      setIsByEvents(true);
    }
  }, [webhooks]);

  const handleSave = async () => {
    if (!selectedInstanceId) return;
    try {
      await updateWebhook.mutateAsync({
        url: webhookUrl,
        events: selectedEvents,
        enabled: isEnabled,
        base64: isBase64,
        byEvents: isByEvents
      });
    } catch (error) {
      console.error('Failed to update webhook:', error);
    }
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  };

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Loading instances...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WebhooksHeader
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        onSelectInstance={setSelectedInstanceId}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <WebhookConfigForm
            webhookUrl={webhookUrl}
            onUrlChange={setWebhookUrl}
            selectedEvents={selectedEvents}
            onToggleEvent={toggleEvent}
            isEnabled={isEnabled}
            onToggleEnabled={() => setIsEnabled(!isEnabled)}
            isBase64={isBase64}
            onToggleBase64={() => setIsBase64(!isBase64)}
            availableEvents={AVAILABLE_EVENTS}
          />
        </div>

        <div className="space-y-6">
          <WebhookSecurityInfo
            onSave={handleSave}
            isPending={updateWebhook.isPending}
            isSuccess={updateWebhook.isSuccess}
            isLoading={isLoadingWebhooks}
            selectedEvents={selectedEvents}
            onToggleEvent={toggleEvent}
            availableEvents={AVAILABLE_EVENTS}
          />
        </div>
      </div>
    </div>
  );
}
