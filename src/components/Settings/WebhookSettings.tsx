/**
 * Webhook Settings - Configure webhook URL and events
 */

import React from 'react';
import { Webhook } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  webhookUrl: string;
  onWebhookUrlChange: (url: string) => void;
  availableEvents: string[];
  selectedEvents: string[];
  onToggleEvent: (event: string) => void;
}

export function WebhookSettings({
  webhookUrl,
  onWebhookUrlChange,
  availableEvents,
  selectedEvents,
  onToggleEvent
}: Props) {
  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <Webhook className="w-5 h-5 text-emerald-500" />
        <h3 className="text-lg font-semibold">Webhook Settings</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Webhook URL</label>
          <input
            type="url"
            className="input w-full"
            placeholder="https://your-server.com/webhooks/whatsapp"
            value={webhookUrl}
            onChange={(e) => onWebhookUrlChange(e.target.value)}
          />
          <p className="text-xs text-zinc-500 mt-1">We'll send event notifications to this URL.</p>
        </div>

        {webhookUrl && (
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-3">Events to Send</label>
            <div className="grid grid-cols-2 gap-3">
              {availableEvents.map(event => (
                <div
                  key={event}
                  onClick={() => onToggleEvent(event)}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-all text-sm",
                    selectedEvents.includes(event)
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "bg-zinc-800/30 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  )}
                >
                  <code className="font-mono">{event}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Selected events will be sent to your webhook URL. A secret key will be generated for signature verification.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
