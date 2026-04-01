/**
 * API Credentials Box - Shows instance ID and evolution name
 */

import { WhatsAppInstance } from '../../types';

interface Props {
  selectedInstance: WhatsAppInstance | undefined;
}

export function ApiCredentialsBox({ selectedInstance }: Props) {
  return (
    <div className="card bg-zinc-900/50 border-zinc-800">
      <h3 className="font-bold text-white mb-4">API Credentials</h3>
      <div className="space-y-4">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Instance ID</p>
          <code className="block bg-zinc-800 p-2 rounded text-xs text-emerald-400 break-all">
            {selectedInstance?.id}
          </code>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Evolution Name</p>
          <code className="block bg-zinc-800 p-2 rounded text-xs text-zinc-300 break-all">
            {selectedInstance?.name.toLowerCase().replace(/\s+/g, '_')}
          </code>
        </div>
      </div>
    </div>
  );
}
