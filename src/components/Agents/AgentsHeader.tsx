/**
 * Agents Header - Title and add agent button
 */

import React from 'react';
import { Plus } from 'lucide-react';

interface Props {
  onCreateClick: () => void;
}

export function AgentsHeader({ onCreateClick }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white">Team & Queue</h1>
        <p className="text-zinc-400 mt-1">Manage agents and incoming chat assignments</p>
      </div>
      <button onClick={onCreateClick} className="btn-primary">
        <Plus className="w-5 h-5" />
        Add Agent
      </button>
    </div>
  );
}
