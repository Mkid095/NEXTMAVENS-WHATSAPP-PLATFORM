/**
 * Instance Tabs Navigation
 */

import React from 'react';
import { Activity, Code2, Key, Users, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WhatsAppInstance } from '../../types';

interface Tab {
  id: 'overview' | 'integration' | 'access' | 'subinstances' | 'settings';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showWhen?: boolean;
}

interface Props {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  instance: WhatsAppInstance;
}

export function InstanceTabs({ activeTab, setActiveTab, instance }: Props) {
  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'integration', label: 'Integration Guide', icon: Code2 },
    { id: 'access', label: 'API Access', icon: Key },
    { id: 'subinstances', label: 'Sub-Instances', icon: Users, showWhen: !instance.isSubInstance },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 w-fit overflow-x-auto">
      {tabs.filter(t => !t.showWhen || t.showWhen).map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
            activeTab === tab.id
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          )}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
