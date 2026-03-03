import React, { useState, useEffect } from 'react';
import {
  useInstances,
  useGroups,
  useCreateGroup,
  useDeleteGroup,
  useGroupParticipants,
  useAddParticipant,
  useRemoveParticipant,
  useGroupDetails,
  useUpdateGroup,
  WhatsAppGroup,
  GroupParticipant,
} from '../hooks/useWhatsApp';
import {
  Users,
  Plus,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Check,
  Save,
  UserPlus,
  UserMinus,
  MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

export function GroupsPage() {
  const { data: instances, isLoading: isLoadingInstances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [selectedGroupJid, setSelectedGroupJid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Form state for create group
  const [groupName, setGroupName] = useState('');
  const [participantsText, setParticipantsText] = useState('');

  // Get groups for selected instance
  const { data: groups, isLoading: isLoadingGroups } = useGroups(selectedInstanceId);
  const createGroup = useCreateGroup();
  const deleteGroup = useDeleteGroup();
  const addParticipant = useAddParticipant(selectedGroupJid || '');
  const removeParticipant = useRemoveParticipant(selectedGroupJid || '');

  // Group details and participants
  const { data: groupDetails } = useGroupDetails(selectedGroupJid || '');
  const { data: participants } = useGroupParticipants(selectedGroupJid || '');

  // Auto-select first instance if none selected
  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstanceId || !groupName.trim()) return;

    const participants = participantsText
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => (p.startsWith('+') ? p : `+${p}`));

    try {
      await createGroup.mutateAsync({
        instanceId: selectedInstanceId,
        name: groupName.trim(),
        participants,
      });
      toast.success('Group created');
      setGroupName('');
      setParticipantsText('');
      setIsCreateModalOpen(false);
    } catch (error) {
      // error handled by mutation
    }
  };

  const handleDeleteGroup = async (group: WhatsAppGroup) => {
    if (window.confirm(`Delete group "${group.name}"?`)) {
      try {
        await deleteGroup.mutateAsync(group.id);
        toast.success('Group deleted');
        if (selectedGroupJid === group.id) {
          setSelectedGroupJid(null);
          setIsDetailsModalOpen(false);
        }
      } catch (error) {
        // error handled
      }
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('participant') as HTMLInputElement;
    const phoneNumber = input?.value?.trim();
    if (!phoneNumber || !selectedGroupJid) return;

    try {
      await addParticipant.mutateAsync(phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`);
      input.value = '';
      // participants will refetch automatically
    } catch (error) {}
  };

  const handleRemoveParticipant = async (participantJid: string) => {
    if (window.confirm('Remove this participant?')) {
      try {
        await removeParticipant.mutateAsync(participantJid);
      } catch (error) {}
    }
  };

  const openGroupDetails = (group: WhatsAppGroup) => {
    setSelectedGroupJid(group.id);
    setIsDetailsModalOpen(true);
  };

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Select an instance to view groups...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Groups</h1>
          <p className="text-zinc-400 mt-1">Manage WhatsApp groups for your instances</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5" />
          Create Group
        </button>
      </div>

      {/* Instance Selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-zinc-400 mb-2">Select Instance</label>
        <select
          value={selectedInstanceId}
          onChange={(e) => setSelectedInstanceId(e.target.value)}
          className="input w-full max-w-xs"
        >
          {instances?.map(inst => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.status})
            </option>
          ))}
        </select>
      </div>

      {/* Groups List */}
      {isLoadingGroups ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      ) : groups && groups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map(group => (
            <div key={group.id} className="card p-6 hover:border-emerald-500/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-white text-lg">{group.name || group.subject}</h3>
                  <p className="text-sm text-zinc-500">{group.participantsCount} participants</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openGroupDetails(group)}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400"
                    title="Manage"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group)}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {group.description && (
                <p className="text-sm text-zinc-400 line-clamp-2">{group.description}</p>
              )}
              <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                {group.isAnnounceGroup && (
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded">Announcement</span>
                )}
                {group.isReadOnly && (
                  <span className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded">Read-only</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">No groups found for this instance</p>
        </div>
      )}

      {/* Create Group Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card bg-zinc-900 border-zinc-800 max-w-lg w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Create New Group</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateGroup} className="space-y-4">
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
                  <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={createGroup.isPending} className="btn-primary">
                    {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Create Group
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Group Details Modal */}
      <AnimatePresence>
        {isDetailsModalOpen && selectedGroupJid && (
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
                  <p className="text-sm text-zinc-500">{participants?.length || 0} participants</p>
                </div>
                <button onClick={() => { setIsDetailsModalOpen(false); setSelectedGroupJid(null); }} className="text-zinc-400 hover:text-white">
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
                      disabled={addParticipant.isPending}
                    />
                    <button type="submit" disabled={addParticipant.isPending} className="btn-primary px-4">
                      {addParticipant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                    </button>
                  </form>
                </div>

                {/* Participants List */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4" /> Participants
                  </h4>
                  {participants && participants.length > 0 ? (
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
                              onClick={() => handleRemoveParticipant(participant.jid)}
                              disabled={removeParticipant.isPending}
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
    </div>
  );
}
