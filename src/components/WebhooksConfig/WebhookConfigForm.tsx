/**
 * Webhook Config Form - Configure webhook endpoint and events
 */

import React from 'react';
import { Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  webhookUrl: string;
  onUrlChange: (url: string) => void;
  selectedEvents: string[];
  onToggleEvent: (event: string) => void;
  isEnabled: boolean;
  onToggleEnabled: () => void;
  isBase64: boolean;
  onToggleBase64: () => void;
  availableEvents: string[];
}

export function WebhookConfigForm({
  webhookUrl,
  onUrlChange,
  selectedEvents,
  onToggleEvent,
  isEnabled,
  onToggleEnabled,
  isBase64,
  onToggleBase64,
  availableEvents
}: Props) {
  return (
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
              onChange={(e) => onUrlChange(e.target.value)}
            />
          </div>
          <p className="text-xs text-zinc-500">The URL where MAVENS will send POST requests for events.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <div
            onClick={onToggleEnabled}
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
            onClick={onToggleBase64}
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
  );
}
