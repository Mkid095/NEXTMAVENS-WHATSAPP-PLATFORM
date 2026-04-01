/**
 * Metrics Grid - Display key performance indicators
 */

import { motion } from 'motion/react';
import { MessageSquare, Users, Clock, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AnalyticsResult } from '../../types';

interface Props {
  analytics: AnalyticsResult;
}

export function MetricsGrid({ analytics }: Props) {
  const metrics = [
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
  ];

  return (
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
  );
}
