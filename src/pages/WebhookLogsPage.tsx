import React, { useState, useEffect } from 'react';
import {
  useInstances,
  useWebhookDeliveries,
} from '../hooks/useWhatsApp';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function WebhookLogsPage() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const limit = 50; // fetch latest 50 deliveries

  const { data: deliveries, isLoading: isLoadingDeliveries } = useWebhookDeliveries(selectedInstanceId, limit);

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Select an instance to view webhook logs...</p>
      </div>
    );
  }

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Webhook Deliveries</h1>
          <p className="text-zinc-400 mt-1">Recent webhook events and their delivery status</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">Showing latest {limit} events</span>
        </div>
      </div>

      {/* Instance Selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-zinc-400 mb-2">Select Instance</label>
        <select
          value={selectedInstanceId}
          onChange={(e) => setSelectedInstanceId(e.target.value)}
          className="input w-full max-w-xs"
        >
          {instances?.map(inst => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.status})
            </option>
          ))}
        </select>
      </div>

      {/* Deliveries Table */}
      {isLoadingDeliveries ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      ) : deliveries && deliveries.length > 0 ? (
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
      ) : (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">No webhook deliveries recorded yet.</p>
        </div>
      )}
    </div>
  );
}
