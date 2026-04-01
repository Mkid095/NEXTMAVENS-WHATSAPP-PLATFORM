/**
 * Desktop Sidebar Component
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Settings,
  Webhook,
  LogOut,
  Zap,
  ShieldCheck,
  BookOpen,
  Users,
  FileText,
  Bot,
  BarChart2,
  Activity as ActivityIcon,
  Key,
} from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useLogout } from '../hooks/useAuth';

import { UseMutationResult } from '@tanstack/react-query';

interface SidebarDesktopProps {
  onLogout: UseMutationResult<void, Error, void, unknown>;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/instances', icon: Smartphone, label: 'Instances' },
  { to: '/messages', icon: MessageSquare, label: 'Messaging' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/webhook-logs', icon: ActivityIcon, label: 'Webhook Logs' },
  { to: '/webhooks', icon: Webhook, label: 'Integrations' },
  { to: '/reseller-api', icon: Key, label: 'Reseller API' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: 'https://whatsapp.nextmavens.cloud/docs', icon: BookOpen, label: 'API Docs', external: true },
];

export function SidebarDesktop({ onLogout }: SidebarDesktopProps) {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex flex-col w-72 border-r border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl p-6 sticky top-0 h-screen">
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">MAVENS</h2>
          <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">WhatsApp API</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map(item => (
          <SidebarItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.to}
            external={item.external}
          />
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-zinc-800/50">
        <div className="bg-zinc-800/50 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Pro Plan</p>
              <p className="text-[10px] text-zinc-500">Active until Apr 2026</p>
            </div>
          </div>
          <div className="w-full bg-zinc-700 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-3/4" />
          </div>
        </div>
        <button
          onClick={() => onLogout.mutateAsync()}
          className="flex items-center gap-3 px-4 py-3 w-full text-zinc-500 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
