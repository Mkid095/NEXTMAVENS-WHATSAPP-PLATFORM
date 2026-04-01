/**
 * Danger Zone - Destructive actions
 */

import React from 'react';
import { AlertCircle, Power, Trash2 } from 'lucide-react';

export function DangerZone() {
  return (
    <div className="card space-y-4">
      <h3 className="font-bold text-white flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-yellow-500" />
        Danger Zone
      </h3>
      <p className="text-xs text-zinc-500">Actions here are permanent and cannot be undone.</p>

      <button className="w-full flex items-center gap-3 px-4 py-3 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all text-sm font-medium">
        <Power className="w-4 h-4" />
        Restart Instance
      </button>

      <button className="w-full flex items-center gap-3 px-4 py-3 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all text-sm font-medium">
        <Trash2 className="w-4 h-4" />
        Delete Instance
      </button>
    </div>
  );
}
