/**
 * Profile Settings - WhatsApp profile name and status
 */

import React from 'react';
import { User, Loader2, Save } from 'lucide-react';

interface Props {
  profileName: string;
  onProfileNameChange: (name: string) => void;
  profileStatus: string;
  onProfileStatusChange: (status: string) => void;
  onSave: () => void;
  isPending: boolean;
}

export function ProfileSettings({
  profileName,
  onProfileNameChange,
  profileStatus,
  onProfileStatusChange,
  onSave,
  isPending
}: Props) {
  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <User className="w-5 h-5 text-emerald-500" />
        <h3 className="text-lg font-semibold">WhatsApp Profile</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Display Name</label>
          <input
            type="text"
            className="input w-full"
            value={profileName}
            onChange={(e) => onProfileNameChange(e.target.value)}
            placeholder="Business Name"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Status (About)</label>
          <input
            type="text"
            className="input w-full"
            value={profileStatus}
            onChange={(e) => onProfileStatusChange(e.target.value)}
            placeholder="Available"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onSave}
          disabled={isPending}
          className="btn-primary"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Profile
        </button>
      </div>
    </div>
  );
}

