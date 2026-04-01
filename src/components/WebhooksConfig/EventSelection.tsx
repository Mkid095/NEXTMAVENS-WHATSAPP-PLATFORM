/**
 * Event Selection - Choose which events to receive
 */

import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  selectedEvents: string[];
  onToggleEvent: (event: string) => void;
  availableEvents: string[];
}

export function EventSelection({ selectedEvents, onToggleEvent, availableEvents }: Props) {
  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <ShieldCheck className="w-5 h-5 text-emerald-500" />
        <h3 className="text-lg font-semibold">Event Selection</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {availableEvents.map(event => (
          <div
            key={event}
            onClick={() => onToggleEvent(event)}
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
  );
}
