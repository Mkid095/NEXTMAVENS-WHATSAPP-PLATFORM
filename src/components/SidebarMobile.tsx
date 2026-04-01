/**
 * Mobile Sidebar Component
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Settings,
  Webhook,
  Zap,
  BookOpen,
  Users,
  FileText,
  Bot,
  BarChart2,
  Activity as ActivityIcon,
  Key,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarItem } from './SidebarItem';

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

interface SidebarMobileProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SidebarMobile({ isOpen, onClose }: SidebarMobileProps) {
  const location = useLocation();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm lg:hidden"
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-zinc-900 p-6 lg:hidden"
          >
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-2">
                <Zap className="w-6 h-6 text-emerald-500" />
                <span className="font-bold text-white">MAVENS</span>
              </div>
              <button onClick={onClose} className="p-2 text-zinc-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="space-y-2">
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
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
