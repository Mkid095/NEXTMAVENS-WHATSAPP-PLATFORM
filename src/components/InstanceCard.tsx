import React from 'react';
import { WhatsAppInstance, useDisconnectInstance } from '../hooks/useWhatsApp';
import { Smartphone, Battery, Signal, Power, Trash2, ExternalLink, MessageSquare, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface InstanceCardProps {
  instance: WhatsAppInstance;
  onConnect: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDetails: (id: string) => void;
  key?: any;
}

export function InstanceCard({ instance, onConnect, onDelete, onViewDetails }: InstanceCardProps) {
  const disconnect = useDisconnectInstance();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED': return 'bg-emerald-500';
      case 'DISCONNECTED': return 'bg-red-500';
      case 'QR_READY': return 'bg-yellow-500';
      case 'CONNECTING': return 'bg-blue-500';
      default: return 'bg-zinc-500';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card group hover:border-emerald-500/30 transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
            instance.status === 'CONNECTED' ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-800 text-zinc-400"
          )}>
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
              {instance.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("w-2 h-2 rounded-full animate-pulse", getStatusColor(instance.status))} />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {instance.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => onViewDetails(instance.id)}
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
            title="View Details"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(instance.id)}
            className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
            title="Delete Instance"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {instance.status === 'CONNECTED' && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3">
            <Battery className={cn(
              "w-4 h-4",
              (instance.battery || 0) < 20 ? "text-red-400" : "text-emerald-400"
            )} />
            <div>
              <p className="text-[10px] text-zinc-500 uppercase">Battery</p>
              <p className="text-sm font-medium">{instance.battery || 0}%</p>
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3">
            <Signal className="w-4 h-4 text-blue-400" />
            <div>
              <p className="text-[10px] text-zinc-500 uppercase">Status</p>
              <p className="text-sm font-medium">{instance.isOnline ? 'Online' : 'Offline'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {instance.status === 'CONNECTED' ? (
          <>
            <button 
              onClick={() => onViewDetails(instance.id)}
              className="btn-primary flex-1"
            >
              <MessageSquare className="w-4 h-4" />
              Messages
            </button>
            <button 
              onClick={() => disconnect.mutate(instance.id)}
              disabled={disconnect.isPending}
              className="btn-secondary px-3"
              title="Disconnect"
            >
              {disconnect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <button 
            onClick={() => onConnect(instance.id)}
            className="btn-primary w-full"
          >
            <Power className="w-4 h-4" />
            Connect Instance
          </button>
        )}
      </div>
    </motion.div>
  );
}
