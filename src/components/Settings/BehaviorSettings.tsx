/**
 * Behavior Settings - Instance behavior toggles
 */

import { Smartphone, Power, Bell, Shield, Loader2, Save } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  rejectCalls: boolean;
  onToggleRejectCalls: () => void;
  alwaysOnline: boolean;
  onToggleAlwaysOnline: () => void;
  groupsIgnore: boolean;
  onToggleGroupsIgnore: () => void;
  onSave: () => void;
  isPending: boolean;
}

export function BehaviorSettings({
  rejectCalls,
  onToggleRejectCalls,
  alwaysOnline,
  onToggleAlwaysOnline,
  groupsIgnore,
  onToggleGroupsIgnore,
  onSave,
  isPending
}: Props) {
  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <Smartphone className="w-5 h-5 text-emerald-500" />
        <h3 className="text-lg font-semibold">Instance Behavior</h3>
      </div>

      <div className="space-y-4">
        <div
          onClick={onToggleRejectCalls}
          className={cn(
            "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
            rejectCalls ? "bg-red-500/5 border-red-500/30" : "bg-zinc-800/30 border-zinc-800"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn("p-2 rounded-lg", rejectCalls ? "bg-red-500/10 text-red-500" : "bg-zinc-800 text-zinc-500")}>
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Reject Calls</p>
              <p className="text-xs text-zinc-500">Automatically decline incoming WhatsApp calls.</p>
            </div>
          </div>
          <div className={cn(
            "w-10 h-5 rounded-full relative transition-colors",
            rejectCalls ? "bg-red-500" : "bg-zinc-700"
          )}>
            <div className={cn(
              "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
              rejectCalls ? "right-1" : "left-1"
            )} />
          </div>
        </div>

        <div
          onClick={onToggleAlwaysOnline}
          className={cn(
            "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
            alwaysOnline ? "bg-emerald-500/5 border-emerald-500/30" : "bg-zinc-800/30 border-zinc-800"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn("p-2 rounded-lg", alwaysOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-800 text-zinc-500")}>
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Always Online</p>
              <p className="text-xs text-zinc-500">Keep the instance status as 'Online' 24/7.</p>
            </div>
          </div>
          <div className={cn(
            "w-10 h-5 rounded-full relative transition-colors",
            alwaysOnline ? "bg-emerald-500" : "bg-zinc-700"
          )}>
            <div className={cn(
              "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
              alwaysOnline ? "right-1" : "left-1"
            )} />
          </div>
        </div>

        <div
          onClick={onToggleGroupsIgnore}
          className={cn(
            "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
            groupsIgnore ? "bg-blue-500/5 border-blue-500/30" : "bg-zinc-800/30 border-zinc-800"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn("p-2 rounded-lg", groupsIgnore ? "bg-blue-500/10 text-blue-500" : "bg-zinc-800 text-zinc-500")}>
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Ignore Groups</p>
              <p className="text-xs text-zinc-500">Do not process or notify for group messages.</p>
            </div>
          </div>
          <div className={cn(
            "w-10 h-5 rounded-full relative transition-colors",
            groupsIgnore ? "bg-blue-500" : "bg-zinc-700"
          )}>
            <div className={cn(
              "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
              groupsIgnore ? "right-1" : "left-1"
            )} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onSave}
          disabled={isPending}
          className="btn-primary"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}
