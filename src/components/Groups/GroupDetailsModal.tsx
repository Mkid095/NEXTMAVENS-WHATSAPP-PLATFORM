/**
 * Group Details Modal - View and manage group participants
 */

import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, UserPlus, UserMinus, Users } from 'lucide-react';
import { WhatsAppGroup, GroupParticipant } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  groupDetails: WhatsAppGroup | undefined;
  participants: GroupParticipant[];
  onAddParticipant: ({ phoneNumber }: { phoneNumber: string }) => Promise<void>;
  onRemoveParticipant: (jid: string) => Promise<void>;
  isAddingParticipant: boolean;
}

export function GroupDetailsModal({
  isOpen,
  onClose,
  groupDetails,
  participants,
  onAddParticipant,
  onRemoveParticipant,
  isAddingParticipant
}: Props) {
  const [newParticipantPhone, setNewParticipantPhone] = useState('');

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipantPhone.trim()) return;
    await onAddParticipant({ phoneNumber: newParticipantPhone });
    setNewParticipantPhone('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="card bg-zinc-900 border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {groupDetails?.subject || groupDetails?.name || 'Group Details'}
                </h2>
                <p className="text-sm text-zinc-500">{participants.length} participants</p>
              </div>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Group Info */}
              {groupDetails && (
                <div className="space-y-2 text-sm">
                  {groupDetails.description && (
                    <p><span className="text-zinc-400">Description:</span> {groupDetails.description}</p>
                  )}
                  <p><span className="text-zinc-400">Created:</span> {new Date(groupDetails.creation).toLocaleDateString()}</p>
                  <div className="flex gap-2 flex-wrap">
                    {groupDetails.isAnnounceGroup && <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded">Announcement Group</span>}
                    {groupDetails.isReadOnly && <span className="px-2 py-1 bg-zinc-700 text-zinc-300 text-xs rounded">Read-only</span>}
                  </div>
                </div>
              )}

              {/* Add Participant */}
              <div className="card bg-zinc-800/50 p-4 space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Add Participant
                </h4>
                <form onSubmit={handleAddParticipant} className="flex gap-2">
                  <input
                    name="participant"
                    type="text"
                    placeholder="+1234567890"
                    className="input flex-1"
                    disabled={isAddingParticipant}
                    value={newParticipantPhone}
                    onChange={e => setNewParticipantPhone(e.target.value)}
                  />
                  <button type="submit" disabled={isAddingParticipant || !newParticipantPhone.trim()} className="btn-primary px-4">
                    {isAddingParticipant ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </button>
                </form>
              </div>

              {/* Participants List */}
              <div className="space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4" /> Participants
                </h4>
                {participants.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {participants.map(participant => (
                      <div key={participant.id} className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg">
                        <div>
                          <p className="font-medium text-white">{participant.name}</p>
                          <p className="text-xs text-zinc-500">{participant.jid}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {participant.isAdmin && (
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded">Admin</span>
                          )}
                          <button
                            onClick={() => onRemoveParticipant(participant.jid)}
                            disabled={isAddingParticipant}
                            className="p-2 text-red-400 hover:bg-red-500/10 rounded"
                            title="Remove"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-sm">No participants</p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import React, { useState } from 'react';
