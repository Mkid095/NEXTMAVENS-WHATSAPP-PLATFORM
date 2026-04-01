/**
 * Groups Grid - Display all groups for selected instance
 */

import { WhatsAppGroup } from '../../types';
import { Loader2, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  groups: WhatsAppGroup[];
  isLoading: boolean;
  onDelete: (group: WhatsAppGroup) => void;
  onViewDetails: (group: WhatsAppGroup) => void;
}

export function GroupsGrid({ groups, isLoading, onDelete, onViewDetails }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="card p-12 text-center border-dashed border-zinc-800">
        <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-500">No groups found for this instance</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map(group => (
        <div key={group.id} className="card p-6 hover:border-emerald-500/30 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="font-bold text-white text-lg">{group.name || group.subject}</h3>
              <p className="text-sm text-zinc-500">{group.participantsCount} participants</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onViewDetails(group)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400"
                title="Manage"
              >
                <Users className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(group)}
                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          {group.description && (
            <p className="text-sm text-zinc-400 line-clamp-2">{group.description}</p>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            {group.isAnnounceGroup && (
              <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded">Announcement</span>
            )}
            {group.isReadOnly && (
              <span className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded">Read-only</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

import { Trash2 } from 'lucide-react';
