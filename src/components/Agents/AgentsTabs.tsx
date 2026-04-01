/**
 * Agents Tabs - Switch between Agents and Queue views
 */

import React from 'react';
import { cn } from '../../lib/utils';

type Tab = 'agents' | 'queue';

interface Props {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  agentsCount: number;
  queueCount: number;
}

export function AgentsTabs({ activeTab, setActiveTab, agentsCount, queueCount }: Props) {
  return (
    <div className="flex gap-4 border-b border-zinc-800 pb-2">
      <button
        onClick={() => setActiveTab('agents')}
        className={cn(
          'px-4 py-2 rounded-t-lg font-medium transition-colors',
          activeTab === 'agents' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
        )}
      >
        Agents ({agentsCount})
      </button>
      <button
        onClick={() => setActiveTab('queue')}
        className={cn(
          'px-4 py-2 rounded-t-lg font-medium transition-colors',
          activeTab === 'queue' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
        )}
      >
        Queue ({queueCount})
      </button>
    </div>
  );
}
