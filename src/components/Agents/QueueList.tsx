/**
 * Queue List - Display pending chats and assign to agents
 */

import { Loader2, Clock, ArrowRight } from 'lucide-react';
import { WhatsAppAgent } from '../../types';

interface Props {
  queue: any[];
  isLoading: boolean;
  agents: WhatsAppAgent[];
  onAssignChat: ({ chatJid, agentId }: { chatJid: string; agentId: string }) => Promise<void>;
  isAssigning: boolean;
}

export function QueueList({ queue, isLoading, agents, onAssignChat, isAssigning }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="card p-12 text-center border-dashed border-zinc-800">
        <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-500">No pending chats in the queue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {queue.map((chat, idx) => (
        <div key={idx} className="card p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-white">{chat.name || chat.number || 'Unknown'}</p>
            <p className="text-sm text-zinc-500">{chat.jid}</p>
            {chat.lastMessage && (
              <p className="text-xs text-zinc-400 mt-1 truncate max-w-md">{chat.lastMessage.text}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input w-40"
              defaultValue=""
              disabled={isAssigning}
              id={`assign-${idx}`}
            >
              <option value="" disabled>Assign to...</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const select = document.getElementById(`assign-${idx}`) as HTMLSelectElement;
                if (select?.value) {
                  onAssignChat({ chatJid: chat.jid, agentId: select.value });
                }
              }}
              disabled={isAssigning}
              className="btn-primary px-3 py-2"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
