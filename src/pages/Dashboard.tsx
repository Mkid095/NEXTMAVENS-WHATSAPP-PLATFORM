/**
 * Dashboard - Professional layout with proper data integration
 */

import React, { useState } from 'react';
import { useInstances } from '../hooks';
import { InstanceCard } from '../components/InstanceCard';
import { StatsOverview } from '../components/StatsOverview';
import { DashboardFilters } from '../components/DashboardFilters';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { QRWizardModal } from '../components/QRWizardModal';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

export function Dashboard() {
  const { data: instances, isLoading, refetch } = useInstances();
  const navigate = useNavigate();
  const createInstance = useCreateInstance();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeWizardId, setActiveWizardId] = useState<string | null>(null);

  const filteredInstances = (instances || []).filter(inst =>
    inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inst.phoneNumber?.includes(searchQuery)
  );

  const handleCreateInstance = async (name: string) => {
    try {
      await createInstance.mutateAsync({ name });
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error('Failed to create instance:', error);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">WhatsApp Instances</h1>
          <p className="text-zinc-400 mt-2 text-sm">Manage and monitor your WhatsApp Evolution connections.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary flex items-center gap-2 px-6 py-3"
        >
          <Plus className="w-5 h-5" />
          New Instance
        </button>
      </div>

      <StatsOverview instances={instances} />

      <DashboardFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* Instances Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-zinc-500">Loading instances...</p>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/20 rounded-2xl border border-dashed border-zinc-800">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-xl font-semibold text-zinc-300">No instances found</h3>
          <p className="text-zinc-500 mt-2 max-w-md mx-auto">
            {instances?.length === 0
              ? 'Create your first WhatsApp instance to get started.'
              : 'No instances match your search.'}
          </p>
          {(instances?.length || 0) === 0 && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary mt-6 mx-auto flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Instance
            </button>
          )}
        </div>
      ) : (
        <div className={cn(
          "grid gap-6",
          viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
        )}>
          {filteredInstances.map(inst => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              onConnect={(id) => setActiveWizardId(id)}
              onDelete={(id) => console.log('Delete', id)}
              onViewDetails={(id) => navigate(`/instances/${id}`)}
            />
          ))}
        </div>
      )}

      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateInstance}
        isPending={createInstance.isPending}
      />

      <QRWizardModal
        instanceId={activeWizardId}
        onClose={() => setActiveWizardId(null)}
        onConnected={() => {
          setTimeout(() => setActiveWizardId(null), 2000);
          refetch();
        }}
      />
    </div>
  );
}
