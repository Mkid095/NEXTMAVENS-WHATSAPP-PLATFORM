/**
 * Agent Performance Table - Shows agent metrics
 */

import { TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AgentAnalytics } from '../../types';

interface Props {
  agents: AgentAnalytics[];
}

export function AgentPerformanceTable({ agents }: Props) {
  if (agents.length === 0) return null;

  return (
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
            {agents.map((agent: any, idx: number) => (
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
  );
}
