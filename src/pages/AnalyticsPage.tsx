/**
 * Analytics Page - Main container
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useAnalytics } from '../hooks';
import { AnalyticsHeader, MetricsGrid, AgentPerformanceTable } from '../components/Analytics';
import { InstanceSelector } from '../components/common/InstanceSelector';
import { Loader2 } from 'lucide-react';
import { Period } from '../types';

export function AnalyticsPage() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('week');

  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics(selectedInstanceId, period);

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Select an instance to view analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AnalyticsHeader period={period} onPeriodChange={setPeriod} />

      <InstanceSelector
        instances={instances || []}
        selectedInstanceId={selectedInstanceId}
        onSelect={setSelectedInstanceId}
      />

      {isLoadingAnalytics ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      ) : analytics ? (
        <>
          <MetricsGrid analytics={analytics} />
          <AgentPerformanceTable agents={analytics.agents || []} />
        </>
      ) : (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <p className="text-zinc-500">No analytics data available for this period.</p>
        </div>
      )}
    </div>
  );
}
