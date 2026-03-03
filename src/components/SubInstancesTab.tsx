import React, { useState } from 'react';
import { useSubInstances, useCreateSubInstance, useDeleteSubInstance, useSubInstanceStatus, WhatsAppInstance } from '../hooks/useWhatsApp';
import { Plus, Trash2, Smartphone, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

interface SubInstancesTabProps {
  parentInstanceId: string;
}

export function SubInstancesTab({ parentInstanceId }: SubInstancesTabProps) {
  const { data: subInstances, isLoading, refetch } = useSubInstances(parentInstanceId);
  const createSubInstance = useCreateSubInstance();
  const deleteSubInstance = useDeleteSubInstance();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubClientName, setNewSubClientName] = useState('');
  const [newSubClientEmail, setNewSubClientEmail] = useState('');
  const [newSubQuota, setNewSubQuota] = useState<number | undefined>(undefined);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSubInstance.mutateAsync({
        parentInstanceId,
        name: newSubName,
        clientName: newSubClientName || undefined,
        clientEmail: newSubClientEmail || undefined,
        quotaLimit: newSubQuota,
      });
      setShowCreateModal(false);
      setNewSubName('');
      setNewSubClientName('');
      setNewSubClientEmail('');
      setNewSubQuota(undefined);
      refetch();
      toast.success('Sub-instance created successfully!');
    } catch (error) {
      toast.error('Failed to create sub-instance');
    }
  };

  const handleDelete = async (subId: string, subName: string) => {
    if (!confirm(`Delete sub-instance "${subName}"? This cannot be undone.`)) return;
    try {
      await deleteSubInstance.mutateAsync(subId);
      toast.success('Sub-instance deleted');
      refetch();
    } catch (error) {
      toast.error('Failed to delete sub-instance');
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'CONNECTED': return 'bg-emerald-500/20 text-emerald-400';
      case 'QR_READY': return 'bg-yellow-500/20 text-yellow-400';
      case 'DISCONNECTED': return 'bg-red-500/20 text-red-400';
      default: return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Sub-Instances</h3>
          <p className="text-zinc-500 text-sm mt-1">Create and manage WhatsApp instances for your clients</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Create Sub-Instance
        </button>
      </div>

      {subInstances?.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <Smartphone className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-zinc-300 mb-2">No sub-instances yet</h4>
          <p className="text-zinc-500 mb-6">Create sub-instances to provide WhatsApp API access to your clients.</p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create First Sub-Instance
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Name</th>
                <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Status</th>
                <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Phone</th>
                <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">API Key</th>
                <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4 pr-4">Quota</th>
                <th className="text-left text-xs font-bold uppercase tracking-widest text-zinc-500 pb-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subInstances?.map((sub: any) => (
                <tr key={sub.id} className="border-b border-zinc-800/50 last:border-0">
                  <td className="py-4 pr-4">
                    <div>
                      <p className="font-semibold text-white">{sub.name}</p>
                      {sub.clientName && (
                        <p className="text-xs text-zinc-500">{sub.clientName}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getStatusColor(sub.status)}`}>
                      {sub.status || 'DISCONNECTED'}
                    </span>
                  </td>
                  <td className="py-4 pr-4 text-sm text-zinc-300 font-mono">
                    {sub.phoneNumber || '-'}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-emerald-400 font-mono truncate max-w-[120px]">
                        {sub.evolutionApiKey?.slice(0, 12)}...
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(sub.evolutionApiKey || '');
                          toast.success('API key copied');
                        }}
                        className="p-1 text-zinc-400 hover:text-white"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-sm text-zinc-400">
                    {sub.quotaLimit ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-zinc-700 rounded-full h-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{ width: `${Math.min((sub.quotaUsed / sub.quotaLimit) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs">{sub.quotaUsed}/{sub.quotaLimit}</span>
                      </div>
                    ) : (
                      'Unlimited'
                    )}
                  </td>
                  <td className="py-4">
                    <button
                      onClick={() => handleDelete(sub.id, sub.name)}
                      className="p-2 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                      title="Delete sub-instance"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Sub-Instance Modal */}
      {showCreateModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full"
          >
            <h3 className="text-xl font-bold text-white mb-6">Create Sub-Instance</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Instance Name *</label>
                <input
                  type="text"
                  required
                  className="input w-full"
                  placeholder="Client Business Name"
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Client Name</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="John Doe (contact person)"
                  value={newSubClientName}
                  onChange={e => setNewSubClientName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Client Email</label>
                <input
                  type="email"
                  className="input w-full"
                  placeholder="client@example.com"
                  value={newSubClientEmail}
                  onChange={e => setNewSubClientEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Message Quota (optional)</label>
                <input
                  type="number"
                  className="input w-full"
                  placeholder="Leave empty for unlimited"
                  min={1}
                  value={newSubQuota || ''}
                  onChange={e => setNewSubQuota(e.target.value ? parseInt(e.target.value) : undefined)}
                />
                <p className="text-xs text-zinc-500 mt-1">Maximum messages per period</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={createSubInstance.isPending} className="btn-primary flex-1">
                  {createSubInstance.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
