/**
 * Analytics Header - Title and period selector
 */

import { BarChart2, TrendingUp } from 'lucide-react';
import { Period } from '../../types';
import { PeriodSelector } from './PeriodSelector';

interface Props {
  period: Period;
  onPeriodChange: (period: Period) => void;
}

export function AnalyticsHeader({ period, onPeriodChange }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="text-zinc-400 mt-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Performance metrics for your WhatsApp instance
        </p>
      </div>
      <div className="flex items-center gap-4">
        <PeriodSelector period={period} onPeriodChange={onPeriodChange} />
      </div>
    </div>
  );
}
