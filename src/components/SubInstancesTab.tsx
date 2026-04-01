/**
 * Sub-Instances Tab - Container using sub-components
 */

import React, { useState } from 'react';
import { useSubInstances, useCreateSubInstance, useDeleteSubInstance } from '../hooks';
import { toast } from 'react-hot-toast';
import { SubInstancesHeader, SubInstancesList, CreateSubInstanceModal } from './SubInstances';
import { WhatsAppInstance } from '../types';

interface SubInstancesTabProps {
  parentInstanceId: string;
}

export function SubInstancesTab({ parentInstanceId }: SubInstancesTabProps) {
  const { data: subInstances, isLoading, refetch } = useSubInstances(parentInstanceId);
  const createSubInstance = useCreateSubInstance();
  const deleteSubInstance = useDeleteSubInstance();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = async (e: React.FormEvent, name: string, clientName: string, clientEmail: string, quotaLimit?: number) => {
    e.preventDefault();
    try {
      await createSubInstance.mutateAsync({
        parentInstanceId,
        name,
        clientName: clientName || undefined,
        clientEmail: clientEmail || undefined,
        quotaLimit,
      });
      setShowCreateModal(false);
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

  const handleCopyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied');
  };

  return (
    <div className="space-y-6">
      <SubInstancesHeader onCreateClick={() => setShowCreateModal(true)} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      ) : (
        <SubInstancesList
          subInstances={subInstances || []}
          onCopyApiKey={handleCopyApiKey}
          onDelete={handleDelete}
        />
      )}

      <CreateSubInstanceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        isPending={createSubInstance.isPending}
      />
    </div>
  );
}

import { Loader2 } from 'lucide-react';
