import React from 'react';
import { Phone, LayoutGrid, Send } from 'lucide-react';
import { WhatsAppInstance } from '../hooks/useWhatsApp';

interface StatsOverviewProps {
  instances: WhatsAppInstance[] | undefined;
}

export function StatsOverview({ instances }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="card bg-emerald-500/5 border-emerald-500/20">
        <p className="text-zinc-500 text-sm font-medium uppercase tracking-wider">Connected</p>
        <div className="flex items-end justify-between mt-2">
          <h2 className="text-4xl font-bold text-emerald-500">
            {instances?.filter(i => i.status === 'CONNECTED').length || 0}
          </h2>
          <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Phone className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
      </div>
      <div className="card bg-blue-500/5 border-blue-500/20">
        <p className="text-zinc-500 text-sm font-medium uppercase tracking-wider">Total Instances</p>
        <div className="flex items-end justify-between mt-2">
          <h2 className="text-4xl font-bold text-blue-500">{instances?.length || 0}</h2>
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-blue-500" />
          </div>
        </div>
      </div>
      <div className="card bg-purple-500/5 border-purple-500/20">
        <p className="text-zinc-500 text-sm font-medium uppercase tracking-wider">Messages Sent</p>
        <div className="flex items-end justify-between mt-2">
          <h2 className="text-4xl font-bold text-purple-500">1.2k</h2>
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
            <Send className="w-5 h-5 text-purple-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
