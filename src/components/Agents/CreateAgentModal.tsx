/**
 * Create Agent Modal - Form to add new agent
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent, name: string, avatar?: string) => Promise<void>;
  isPending: boolean;
}

export function CreateAgentModal({ isOpen, onClose, onSubmit, isPending }: Props) {
  const [agentName, setAgentName] = useState('');
  const [agentAvatar, setAgentAvatar] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    onSubmit(e, agentName, agentAvatar || undefined);
    if (!isPending) {
      setAgentName('');
      setAgentAvatar('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="card bg-zinc-900 border-zinc-800 max-w-lg w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add New Agent</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Agent Name</label>
                <input
                  type="text"
                  required
                  className="input w-full"
                  placeholder="Enter agent name"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Avatar URL (optional)</label>
                <input
                  type="url"
                  className="input w-full"
                  placeholder="https://example.com/avatar.jpg"
                  value={agentAvatar}
                  onChange={e => setAgentAvatar(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn-primary">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Add Agent
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
