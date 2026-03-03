import React, { useState, useEffect } from 'react';
import {
  useInstances,
  useAnalytics,
} from '../hooks/useWhatsApp';
import {
  BarChart2,
  MessageSquare,
  Users,
  Clock,
  CheckCircle,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

type Period = 'day' | 'week' | 'month';

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

  const metrics = analytics ? [
    {
      title: 'Total Messages',
      value: analytics.conversations?.totalMessages || analytics.messages?.totalMessages || 0,
      icon: MessageSquare,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'Conversations Started',
      value: analytics.conversations?.started || 0,
      icon: Users,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      title: 'Avg Response Time',
      value: analytics.sla?.avgFirstResponseTime ? `${Math.round(analytics.sla.avgFirstResponseTime / 60)}m` : 'N/A',
      icon: Clock,
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
    },
    {
      title: 'Resolution Rate',
      value: analytics.sla?.resolutionRate ? `${Math.round(analytics.sla.resolutionRate * 100)}%` : 'N/A',
      icon: CheckCircle,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
  ] : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-400 mt-1">Performance metrics for your WhatsApp instance</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
            className="input w-32"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
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

      {isLoadingAnalytics ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      ) : metrics.length > 0 ? (
        <>
          {/* Key Metrics Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric, idx) => (
              <motion.div
                key={metric.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="card p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn('p-3 rounded-xl', metric.bg)}>
                    <metric.icon className={cn('w-6 h-6', metric.color)} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-white">{metric.value}</p>
                <p className="text-sm text-zinc-400">{metric.title}</p>
              </motion.div>
            ))}
          </div>

          {/* Agent Performance Table */}
          {analytics.agents && analytics.agents.length > 0 && (
            <div className="card p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Agent Performance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-800">
                      <th className="text-left py-3">Agent</th>
                      <th className="text-right py-3">Messages Handled</th>
                      <th className="text-right py-3">Avg Response Time</th>
                      <th className="text-right py-3">Satisfaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.agents.map((agent: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-800/50">
                        <td className="py-3 text-white">{agent.agentName}</td>
                        <td className="text-right text-zinc-300">{agent.messagesHandled}</td>
                        <td className="text-right text-zinc-300">
                          {agent.avgResponseTime ? `${Math.round(agent.avgResponseTime / 60)} min` : '-'}
                        </td>
                        <td className="text-right text-zinc-300">{agent.satisfactionScore ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <BarChart2 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">No analytics data available for this period.</p>
        </div>
      )}
    </div>
  );
}
