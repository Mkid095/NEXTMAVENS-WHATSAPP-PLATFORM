import React, { useState, useEffect } from 'react';
import { useInstances, useWebhooks, useUpdateWebhook } from '../hooks/useWhatsApp';
import { Webhook, Loader2, Save, CheckCircle2, AlertCircle, Smartphone, Globe, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Webhooks</h1>
          <p className="text-zinc-400 mt-1">Configure real-time event notifications for your instances.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium px-2">Instance:</span>
          <select 
            value={selectedInstanceId || ''} 
            onChange={(e) => setSelectedInstanceId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {instances?.map(inst => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="card space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <Globe className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold">Endpoint Configuration</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Webhook URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="url"
                    placeholder="https://your-api.com/webhooks/whatsapp"
                    className="input w-full pl-10"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                </div>
                <p className="text-xs text-zinc-500">The URL where MAVENS will send POST requests for events.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                <div 
                  onClick={() => setIsEnabled(!isEnabled)}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                    isEnabled ? "bg-emerald-500/5 border-emerald-500/30" : "bg-zinc-800/30 border-zinc-800"
                  )}
                >
                  <div>
                    <p className="font-medium">Webhook Enabled</p>
                    <p className="text-xs text-zinc-500">Enable or disable all notifications.</p>
                  </div>
                  <div className={cn(
                    "w-10 h-5 rounded-full relative transition-colors",
                    isEnabled ? "bg-emerald-500" : "bg-zinc-700"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      isEnabled ? "right-1" : "left-1"
                    )} />
                  </div>
                </div>

                <div 
                  onClick={() => setIsBase64(!isBase64)}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                    isBase64 ? "bg-blue-500/5 border-blue-500/30" : "bg-zinc-800/30 border-zinc-800"
                  )}
                >
                  <div>
                    <p className="font-medium">Base64 Payloads</p>
                    <p className="text-xs text-zinc-500">Send media as base64 strings.</p>
                  </div>
                  <div className={cn(
                    "w-10 h-5 rounded-full relative transition-colors",
                    isBase64 ? "bg-blue-500" : "bg-zinc-700"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      isBase64 ? "right-1" : "left-1"
                    )} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold">Event Selection</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AVAILABLE_EVENTS.map(event => (
                <div 
                  key={event}
                  onClick={() => toggleEvent(event)}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3",
                    selectedEvents.includes(event) 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-zinc-800/30 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                    selectedEvents.includes(event) ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"
                  )}>
                    {selectedEvents.includes(event) && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-xs font-mono">{event}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card bg-emerald-500/5 border-emerald-500/20">
            <h3 className="font-bold text-emerald-500 mb-2">Webhook Security</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              MAVENS signs all webhook requests with an HMAC-SHA256 signature. 
              Verify the <code className="bg-zinc-800 px-1 rounded">X-Evolution-Signature</code> header 
              using your organization's webhook secret.
            </p>
          </div>

          <div className="card space-y-4">
            <button 
              onClick={handleSave}
              disabled={updateWebhook.isPending || isLoadingWebhooks}
              className="btn-primary w-full py-3"
            >
              {updateWebhook.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Configuration
                </>
              )}
            </button>
            
            {updateWebhook.isSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-emerald-500 text-sm justify-center"
              >
                <CheckCircle2 className="w-4 h-4" />
                Settings saved successfully
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
