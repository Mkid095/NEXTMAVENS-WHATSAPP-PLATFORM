/**
 * Instance Selector - Shared dropdown to choose WhatsApp instance
 */

import { WhatsAppInstance } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  instances: WhatsAppInstance[];
  selectedInstanceId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function InstanceSelector({ instances, selectedInstanceId, onSelect, className }: Props) {
  return (
    <div className={cn("card p-4", className)}>
      <label className="block text-sm font-medium text-zinc-400 mb-2">Select Instance</label>
      <select
        value={selectedInstanceId}
        onChange={(e) => onSelect(e.target.value)}
        className="input w-full max-w-xs"
      >
        {instances.map(inst => (
          <option key={inst.id} value={inst.id}>
            {inst.name} ({inst.status})
          </option>
        ))}
      </select>
    </div>
  );
}
