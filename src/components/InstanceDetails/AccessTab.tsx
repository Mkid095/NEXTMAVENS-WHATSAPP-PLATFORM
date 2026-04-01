/**
 * Access Tab - Manage API keys for instance
 */

import { useState, FormEvent } from 'react';
import { Key, Plus, Loader2, Trash2, Copy, Check, ShieldCheck } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '../../hooks';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

interface Props {
  instanceId: string;
  copiedKey: string | null;
  onCopyKey: (key: string) => void;
}

export function AccessTab({ instanceId, copiedKey, onCopyKey }: Props) {
  const [newKeyName, setNewKeyName] = useState('');

  const { data: apiKeys, isLoading: isLoadingKeys } = useApiKeys(instanceId);
  const createKey = useCreateApiKey(instanceId);
  const deleteKey = useDeleteApiKey(instanceId);

  const handleCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    await createKey.mutateAsync({ name: newKeyName });
    setNewKeyName('');
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">API Access Keys</h3>
          <p className="text-zinc-500 text-sm mt-1">Manage specific access tokens for this instance.</p>
        </div>
        <form onSubmit={handleCreateKey} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Key Name (e.g. CRM Integration)"
            className="input min-w-[240px]"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
          />
          <button
            type="submit"
            disabled={createKey.isPending || !newKeyName.trim()}
            className="btn-primary"
          >
            {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Key
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoadingKeys ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : apiKeys?.length === 0 ? (
          <div className="card p-12 text-center border-dashed border-zinc-800">
            <Key className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">No API keys created yet. Create one to start integrating.</p>
          </div>
        ) : (
          apiKeys?.map(apiKey => (
            <div key={apiKey.id} className="card flex items-center justify-between group hover:border-zinc-700 transition-all">
              <div className="flex items-center gap-6">
                <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-bold text-zinc-100">{apiKey.name}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="text-xs text-zinc-500 font-mono">
                      {apiKey.key.substring(0, 8)}••••••••••••••••
                    </code>
                    <button
                      onClick={() => onCopyKey(apiKey.key)}
                      className="text-zinc-500 hover:text-emerald-500 transition-colors"
                    >
                      {copiedKey === apiKey.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Created</p>
                  <p className="text-xs text-zinc-400">{format(new Date(apiKey.createdAt), 'MMM dd, yyyy')}</p>
                </div>
                <button
                  onClick={() => deleteKey.mutate(apiKey.id)}
                  className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
