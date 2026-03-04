import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Settings,
  Webhook,
  LogOut,
  Menu,
  X,
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
import { motion, AnimatePresence } from 'motion/react';
import { SidebarItem } from './SidebarItem';
import { useLogout } from '../hooks/useAuth';

export function Sidebar() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const logout = useLogout();

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
    { to: 'https://whatsappapi.nextmavens.cloud/docs', icon: BookOpen, label: 'API Docs', external: true },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
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
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-zinc-500 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-emerald-500" />
          <span className="font-bold text-white">MAVENS</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-zinc-400">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
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
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-zinc-400">
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
    </>
  );
}
