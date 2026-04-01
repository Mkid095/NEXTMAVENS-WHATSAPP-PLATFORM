/**
 * Webhook Logs Header - Title and info
 */

import React from 'react';
import { Activity, TrendingUp } from 'lucide-react';

interface Props {
  limit: number;
}

export function WebhookLogsHeader({ limit }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white">Webhook Deliveries</h1>
        <p className="text-zinc-400 mt-1">Recent webhook events and their delivery status</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">Showing latest {limit} events</span>
      </div>
    </div>
  );
}
