/**
 * Agents Grid - Display all agents for selected instance
 */

import { WhatsAppAgent } from '../../types';
import { Loader2, User, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  agents: WhatsAppAgent[];
  isLoading: boolean;
  onStatusChange: (agentId: string, status: WhatsAppAgent['status']) => void;
}

export function AgentsGrid({ agents, isLoading, onStatusChange }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="card p-12 text-center border-dashed border-zinc-800">
        <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-500">No agents yet. Add an agent to start handling chats.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {agents.map(agent => (
        <div key={agent.id} className="card p-6 hover:border-emerald-500/30 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                {agent.avatar ? (
                  <img src={agent.avatar} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-6 h-6 text-zinc-500" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-white">{agent.name}</h3>
                <p className="text-xs text-zinc-500">ID: {agent.id.slice(0, 8)}...</p>
              </div>
            </div>
            <span className={cn(
              'px-2 py-1 text-xs rounded',
              agent.status === 'available' ? 'bg-emerald-500/10 text-emerald-500' :
              agent.status === 'busy' ? 'bg-red-500/10 text-red-500' :
              agent.status === 'away' ? 'bg-yellow-500/10 text-yellow-500' :
              'bg-zinc-700 text-zinc-400'
            )}>
              {agent.status}
            </span>
          </div>
          <div className="mt-4">
            <label className="text-xs text-zinc-400">Change Status</label>
            <select
              value={agent.status}
              onChange={(e) => onStatusChange(agent.id, e.target.value as WhatsAppAgent['status'])}
              className="input w-full mt-1 text-sm"
            >
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="away">Away</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
