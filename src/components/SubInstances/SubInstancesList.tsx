/**
 * Sub-Instances List - Table of sub-instances
 */

import { motion } from 'motion/react';
import { Smartphone, Copy, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SubInstance } from '../../types';

interface Props {
  subInstances: SubInstance[];
  onCopyApiKey: (apiKey: string) => void;
  onDelete: (id: string, name: string) => void;
}

export function SubInstancesList({ subInstances, onCopyApiKey, onDelete }: Props) {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'CONNECTED': return 'bg-emerald-500/20 text-emerald-400';
      case 'QR_READY': return 'bg-yellow-500/20 text-yellow-400';
      case 'DISCONNECTED': return 'bg-red-500/20 text-red-400';
      default: return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  if (subInstances.length === 0) {
    return (
      <div className="card p-12 text-center border-dashed border-zinc-800">
        <Smartphone className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <h4 className="text-lg font-semibold text-zinc-300 mb-2">No sub-instances yet</h4>
        <p className="text-zinc-500 mb-6">Create sub-instances to provide WhatsApp API access to your clients.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Name</th>
            <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Status</th>
            <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Phone</th>
            <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">API Key</th>
            <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Quota</th>
            <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-800 pb-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {subInstances.map((sub: any) => (
            <motion.tr
              key={sub.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border-b border-zinc-800/50 last:border-0"
            >
              <td className="py-4 pr-4">
                <div>
                  <p className="font-semibold text-white">{sub.name}</p>
                  {sub.clientName && (
                    <p className="text-xs text-zinc-500">{sub.clientName}</p>
                  )}
                </div>
              </td>
              <td className="py-4 pr-4">
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getStatusColor(sub.status)}`}>
                  {sub.status || 'DISCONNECTED'}
                </span>
              </td>
              <td className="py-4 pr-4 text-sm text-zinc-300 font-mono">
                {sub.phoneNumber || '-'}
              </td>
              <td className="py-4 pr-4">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-emerald-400 font-mono truncate max-w-[120px]">
                    {sub.evolutionApiKey?.slice(0, 12)}...
                  </code>
                  <button
                    onClick={() => onCopyApiKey(sub.evolutionApiKey || '')}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </td>
              <td className="py-4 pr-4 text-sm text-zinc-400">
                {sub.quotaLimit ? (
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-zinc-700 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: `${Math.min((sub.quotaUsed / sub.quotaLimit) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs">{sub.quotaUsed}/{sub.quotaLimit}</span>
                  </div>
                ) : (
                  'Unlimited'
                )}
              </td>
              <td className="py-4">
                <button
                  onClick={() => onDelete(sub.id, sub.name)}
                  className="p-2 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  title="Delete sub-instance"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
