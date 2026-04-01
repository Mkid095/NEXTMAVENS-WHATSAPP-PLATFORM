/**
 * Webhooks Header - Title and instance selector
 */

import { Globe } from 'lucide-react';
import { WhatsAppInstance } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  instances: WhatsAppInstance[];
  selectedInstanceId: string | null;
  onSelectInstance: (id: string) => void;
}

export function WebhooksHeader({ instances, selectedInstanceId, onSelectInstance }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white">Webhooks</h1>
        <p className="text-zinc-400 mt-1">Configure real-time event notifications for your instances.</p>
      </div>

      <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium px-2">Instance:</span>
        <select
          value={selectedInstanceId || ''}
          onChange={(e) => onSelectInstance(e.target.value)}
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
  );
}
