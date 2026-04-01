/**
 * Period Selector - Choose analytics time range
 */

import { Period } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  period: Period;
  onPeriodChange: (period: Period) => void;
}

export function PeriodSelector({ period, onPeriodChange }: Props) {
  return (
    <div className="flex gap-2 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
      {(['day', 'week', 'month'] as Period[]).map(p => (
        <button
          key={p}
          onClick={() => onPeriodChange(p)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            period === p
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          )}
        >
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </button>
      ))}
    </div>
  );
}
