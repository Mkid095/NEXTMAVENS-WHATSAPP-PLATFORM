/**
 * Create Sub-Instance Modal - Form to add new sub-instance
 */

import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { X, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent, name: string, clientName: string, clientEmail: string, quotaLimit?: number) => void;
  isPending: boolean;
}

export function CreateSubInstanceModal({ isOpen, onClose, onSubmit, isPending }: Props) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [quotaLimit, setQuotaLimit] = useState<number | undefined>(undefined);

  const handleSubmit = (e: FormEvent) => {
    onSubmit(e, name, clientName, clientEmail, quotaLimit);
    if (!isPending) {
      setName('');
      setClientName('');
      setClientEmail('');
      setQuotaLimit(undefined);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">Create Sub-Instance</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Instance Name *</label>
            <input
              type="text"
              required
              className="input w-full"
              placeholder="Client Business Name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Client Name</label>
            <input
              type="text"
              className="input w-full"
              placeholder="John Doe (contact person)"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Client Email</label>
            <input
              type="email"
              className="input w-full"
              placeholder="client@example.com"
              value={clientEmail}
              onChange={e => setClientEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Message Quota (optional)</label>
            <input
              type="number"
              className="input w-full"
              placeholder="Leave empty for unlimited"
              min={1}
              value={quotaLimit || ''}
              onChange={e => setQuotaLimit(e.target.value ? parseInt(e.target.value) : undefined)}
            />
            <p className="text-xs text-zinc-500 mt-1">Maximum messages per period</p>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="btn-primary flex-1">
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
