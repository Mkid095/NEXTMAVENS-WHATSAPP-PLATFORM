/**
 * Groups Page - Main container
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useGroups, useCreateGroup, useDeleteGroup, useGroupDetails, useGroupParticipants, useAddParticipant, useRemoveParticipant } from '../hooks';
import { GroupsHeader, GroupsGrid } from '../components/Groups';
import { InstanceSelector } from '../components/common/InstanceSelector';
import { CreateGroupModal } from '../components/Groups/CreateGroupModal';
import { GroupDetailsModal } from '../components/Groups/GroupDetailsModal';
import { Loader2 } from 'lucide-react';

export function GroupsPage() {
  const { data: instances, isLoading: isLoadingInstances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedGroupJid, setSelectedGroupJid] = useState<string | null>(null);

  const { data: groups, isLoading: isLoadingGroups } = useGroups(selectedInstanceId);
  const createGroup = useCreateGroup();
  const deleteGroup = useDeleteGroup();
  const addParticipant = useAddParticipant(selectedGroupJid || '');
  const removeParticipant = useRemoveParticipant(selectedGroupJid || '');
  const { data: groupDetails } = useGroupDetails(selectedGroupJid || '');
  const { data: participants } = useGroupParticipants(selectedGroupJid || '');

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  const handleCreateGroup = async (e: React.FormEvent, groupName: string, participantsText: string) => {
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
      setIsCreateModalOpen(false);
    } catch (error) {}
  };

  const handleDeleteGroup = async (group: any) => {
    if (window.confirm(`Delete group "${group.name}"?`)) {
      try {
        await deleteGroup.mutateAsync(group.id);
        if (selectedGroupJid === group.id) {
          setSelectedGroupJid(null);
          setIsDetailsModalOpen(false);
        }
      } catch (error) {}
    }
  };

  const openGroupDetails = (group: any) => {
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
      <GroupsHeader onCreateClick={() => setIsCreateModalOpen(true)} />

      <InstanceSelector
        instances={instances || []}
        selectedInstanceId={selectedInstanceId}
        onSelect={setSelectedInstanceId}
      />

      <GroupsGrid
        groups={groups || []}
        isLoading={isLoadingGroups}
        onDelete={handleDeleteGroup}
        onViewDetails={openGroupDetails}
      />

      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateGroup}
        isPending={createGroup.isPending}
      />

      <GroupDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => { setIsDetailsModalOpen(false); setSelectedGroupJid(null); }}
        groupDetails={groupDetails}
        participants={participants || []}
        onAddParticipant={({ phoneNumber }) => addParticipant.mutateAsync(phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`)}
        onRemoveParticipant={removeParticipant.mutateAsync}
        isAddingParticipant={addParticipant.isPending}
      />
    </div>
  );
}
