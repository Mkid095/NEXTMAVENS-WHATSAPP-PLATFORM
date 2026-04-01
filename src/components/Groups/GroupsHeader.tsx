/**
 * Groups Header - Title and create button
 */

import React from 'react';
import { Plus } from 'lucide-react';

interface Props {
  onCreateClick: () => void;
}

export function GroupsHeader({ onCreateClick }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white">Groups</h1>
        <p className="text-zinc-400 mt-1">Manage WhatsApp groups for your instances</p>
      </div>
      <button onClick={onCreateClick} className="btn-primary">
        <Plus className="w-5 h-5" />
        Create Group
      </button>
    </div>
  );
}
