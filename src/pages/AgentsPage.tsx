import React, { useState, useEffect } from 'react';
import {
  useInstances,
  useAgents,
  useCreateAgent,
  useUpdateAgentStatus,
  useQueue,
  useAssignChat,
  WhatsAppAgent,
} from '../hooks/useWhatsApp';
import {
  Bot,
  Plus,
  Loader2,
  X,
  User,
  Check,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

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
  const createAgent = useCreateAgent(selectedInstanceId);
  const updateAgentStatus = useUpdateAgentStatus();

  const { data: queue, isLoading: isLoadingQueue } = useQueue(selectedInstanceId);
  const assignChat = useAssignChat();

  // Auto-select instance
  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const first = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(first.id);
    }
  }, [instances, selectedInstanceId]);

  // Handlers
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstanceId || !agentName.trim()) return;
    try {
      await createAgent.mutateAsync({ name: agentName.trim(), avatar: agentAvatar.trim() || undefined });
      toast.success('Agent created');
      setAgentName('');
      setAgentAvatar('');
      setIsCreateModalOpen(false);
    } catch {}
  };

  const handleStatusChange = async (agentId: string, status: WhatsAppAgent['status']) => {
    try {
      await updateAgentStatus.mutateAsync({ agentId, status });
    } catch {}
  };

  const handleAssignChat = async (chatJid: string, agentId: string) => {
    try {
      await assignChat.mutateAsync({ chatJid, agentId });
      toast.success('Chat assigned');
    } catch {}
  };

  // Render functions for tabs
  const renderAgentsTab = () => {
    if (isLoadingAgents) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      );
    }
    if (!agents || agents.length === 0) {
      return (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">No agents yet. Add an agent to start handling chats.</p>
        </div>
      );
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent: any) => (
          <div key={agent.id} className="card p-6 hover:border-emerald-500/30 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <User className="w-6 h-6 text-zinc-500" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white">{agent.name}</h3>
                  <p className="text-xs text-zinc-500">ID: {agent.id.slice(0, 8)}...</p>
                </div>
              </div>
              <span className={cn(
                'px-2 py-1 text-xs rounded',
                agent.status === 'available' ? 'bg-emerald-500/10 text-emerald-500' :
                agent.status === 'busy' ? 'bg-red-500/10 text-red-500' :
                agent.status === 'away' ? 'bg-yellow-500/10 text-yellow-500' :
                'bg-zinc-700 text-zinc-400'
              )}>
                {agent.status}
              </span>
            </div>
            <div className="mt-4">
              <label className="text-xs text-zinc-400">Change Status</label>
              <select
                value={agent.status}
                onChange={(e) => handleStatusChange(agent.id, e.target.value as any)}
                className="input w-full mt-1 text-sm"
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="away">Away</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderQueueTab = () => {
    if (isLoadingQueue) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      );
    }
    if (!queue || queue.length === 0) {
      return (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">No pending chats in the queue.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {queue.map((chat: any, idx: number) => (
          <div key={idx} className="card p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{chat.name || chat.number || 'Unknown'}</p>
              <p className="text-sm text-zinc-500">{chat.jid}</p>
              {chat.lastMessage && (
                <p className="text-xs text-zinc-400 mt-1 truncate max-w-md">{chat.lastMessage.text}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input w-40"
                defaultValue=""
                disabled={assignChat.isPending}
              >
                <option value="" disabled>Assign to...</option>
                {agents?.map((agent: any) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const select = document.getElementById(`assign-${idx}`) as HTMLSelectElement;
                  if (select?.value) {
                    handleAssignChat(chat.jid, select.value);
                  }
                }}
                disabled={assignChat.isPending}
                className="btn-primary px-3 py-2"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Team & Queue</h1>
          <p className="text-zinc-400 mt-1">Manage agents and incoming chat assignments</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5" />
          Add Agent
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

      {/* Tabs */}
      <div className="flex gap-4 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('agents')}
          className={cn(
            'px-4 py-2 rounded-t-lg font-medium transition-colors',
            activeTab === 'agents' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
          )}
        >
          Agents ({agents?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={cn(
            'px-4 py-2 rounded-t-lg font-medium transition-colors',
            activeTab === 'queue' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
          )}
        >
          Queue ({queue?.length || 0})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'agents' && renderAgentsTab()}
      {activeTab === 'queue' && renderQueueTab()}

      {/* Create Agent Modal */}
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
                <h2 className="text-xl font-bold text-white">Add New Agent</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateAgent} className="space-y-4">
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
                  <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={createAgent.isPending} className="btn-primary">
                    {createAgent.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Add Agent
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
