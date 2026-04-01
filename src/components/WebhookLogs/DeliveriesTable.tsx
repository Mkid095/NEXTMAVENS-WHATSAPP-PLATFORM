/**
 * Deliveries Table - Display webhook delivery history
 */

import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle, XCircle, Clock, Loader2, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  deliveries: any[];
  isLoading: boolean;
}

export function DeliveriesTable({ deliveries, isLoading }: Props) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-emerald-500 bg-emerald-500/10';
      case 'failed':
        return 'text-red-500 bg-red-500/10';
      default:
        return 'text-yellow-500 bg-yellow-500/10';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="card p-12 text-center border-dashed border-zinc-800">
        <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-500">No webhook deliveries recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50">
            <tr>
              <th className="text-left py-3 px-4 text-zinc-400 font-medium">Event</th>
              <th className="text-left py-3 px-4 text-zinc-400 font-medium">Status</th>
              <th className="text-right py-3 px-4 text-zinc-400 font-medium">Code</th>
              <th className="text-right py-3 px-4 text-zinc-400 font-medium">Duration</th>
              <th className="text-right py-3 px-4 text-zinc-400 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery: any, idx: number) => (
              <motion.tr
                key={delivery.id || idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="border-t border-zinc-800 hover:bg-zinc-800/30"
              >
                <td className="py-3 px-4 text-white font-mono text-xs">{delivery.event}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(delivery.status)}
                    <span className={cn('px-2 py-0.5 rounded text-xs', getStatusColor(delivery.status))}>
                      {delivery.status.toUpperCase()}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-zinc-300">{delivery.responseCode || '-'}</td>
                <td className="py-3 px-4 text-right text-zinc-300">
                  {delivery.duration ? `${Math.round(delivery.duration)}ms` : '-'}
                </td>
                <td className="py-3 px-4 text-right text-zinc-400 text-xs">
                  {new Date(delivery.createdAt).toLocaleTimeString()}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
