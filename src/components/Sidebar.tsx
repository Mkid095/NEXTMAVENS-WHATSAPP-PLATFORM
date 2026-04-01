import React, { useState } from 'react';
import { useLogout } from '../hooks/useAuth';
import { SidebarDesktop } from './SidebarDesktop';
import { SidebarMobile } from './SidebarMobile';
import { Zap, Menu } from 'lucide-react';

export function Sidebar() {
  const logout = useLogout();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <SidebarDesktop onLogout={logout} />
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-emerald-500" />
          <span className="font-bold text-white">MAVENS</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-zinc-400">
          <Menu className="w-6 h-6" />
        </button>
      </div>
      <SidebarMobile isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </>
  );
}
