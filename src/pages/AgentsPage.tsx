/**
 * Agents Page - Main container
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useAgents, useCreateAgent, useUpdateAgentStatus, useQueue, useAssignChat } from '../hooks';
import { AgentsHeader, AgentsTabs, AgentsGrid, QueueList, CreateAgentModal } from '../components/Agents';
import { InstanceSelector } from '../components/common/InstanceSelector';
import { Loader2 } from 'lucide-react';
import { WhatsAppAgent } from '../types';

type Tab = 'agents' | 'queue';

export function AgentsPage() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('agents');

  // Agent creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentAvatar, setAgentAvatar] = useState('');

  // Data hooks
  const { data: agents, isLoading: isLoadingAgents } = useAgents(selectedInstanceId);
  const createAgent = useCreateAgent();
  const updateAgentStatus = useUpdateAgentStatus();

  const { data: queue, isLoading: isLoadingQueue } = useQueue(selectedInstanceId);
  const assignChat = useAssignChat();

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const first = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(first.id);
    }
  }, [instances, selectedInstanceId]);

  const handleCreateAgent = async (e: React.FormEvent, name: string, avatar?: string) => {
    e.preventDefault();
    if (!selectedInstanceId || !name.trim()) return;
    try {
      await createAgent.mutateAsync({ instanceId: selectedInstanceId, name: name.trim(), avatar: avatar?.trim() || undefined });
      setIsCreateModalOpen(false);
      setAgentName('');
      setAgentAvatar('');
    } catch {}
  };

  const handleStatusChange = async (agentId: string, status: WhatsAppAgent['status']) => {
    try {
      await updateAgentStatus.mutateAsync({ agentId, status });
    } catch {}
  };

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Select an instance to manage agents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AgentsHeader onCreateClick={() => setIsCreateModalOpen(true)} />

      <InstanceSelector
        instances={instances || []}
        selectedInstanceId={selectedInstanceId}
        onSelect={setSelectedInstanceId}
      />

      <AgentsTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        agentsCount={agents?.length || 0}
        queueCount={queue?.length || 0}
      />

      {activeTab === 'agents' && (
        <AgentsGrid
          agents={agents || []}
          isLoading={isLoadingAgents}
          onStatusChange={handleStatusChange}
        />
      )}

      {activeTab === 'queue' && (
        <QueueList
          queue={queue || []}
          isLoading={isLoadingQueue}
          agents={agents || []}
          onAssignChat={async ({ chatJid, agentId }) => {
            await assignChat.mutateAsync({ chatJid, agentId, instanceId: selectedInstanceId });
          }}
          isAssigning={assignChat.isPending}
        />
      )}

      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateAgent}
        isPending={createAgent.isPending}
      />
    </div>
  );
}
