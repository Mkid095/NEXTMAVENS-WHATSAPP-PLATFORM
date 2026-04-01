/**
 * Create Group Modal - Form to create new WhatsApp group
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent, name: string, participants: string) => void;
  isPending: boolean;
}

export function CreateGroupModal({ isOpen, onClose, onSubmit, isPending }: Props) {
  const [groupName, setGroupName] = useState('');
  const [participantsText, setParticipantsText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    onSubmit(e, groupName, participantsText);
    if (!isPending) {
      setGroupName('');
      setParticipantsText('');
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
              <h2 className="text-xl font-bold text-white">Create New Group</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Group Name</label>
                <input
                  type="text"
                  required
                  className="input w-full"
                  placeholder="Enter group name"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Participants (optional, one phone number per line)
                </label>
                <textarea
                  className="input w-full h-32"
                  placeholder="+1234567890&#10;+0987654321"
                  value={participantsText}
                  onChange={e => setParticipantsText(e.target.value)}
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Phone numbers should include country code (e.g., +1234567890)
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn-primary">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Create Group
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
