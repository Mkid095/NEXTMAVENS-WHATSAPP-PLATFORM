/**
 * Sub-Instances Header - Title and create button
 */

import { Plus } from 'lucide-react';

interface Props {
  onCreateClick: () => void;
}

export function SubInstancesHeader({ onCreateClick }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-xl font-bold text-white">Sub-Instances</h3>
        <p className="text-zinc-500 text-sm mt-1">Create and manage WhatsApp instances for your clients</p>
      </div>
      <button onClick={onCreateClick} className="btn-primary">
        <Plus className="w-4 h-4" />
        Create Sub-Instance
      </button>
    </div>
  );
}
