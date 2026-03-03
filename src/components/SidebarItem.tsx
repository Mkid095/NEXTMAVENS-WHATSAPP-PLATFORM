import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface SidebarItemProps {
  to: string;
  icon: any;
  label: string;
  active: boolean;
  key?: any;
}

export function SidebarItem({ to, icon: Icon, label, active }: SidebarItemProps) {
  return (
    <Link 
      to={to}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-emerald-500/10 text-emerald-500" 
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
      )}
    >
      <Icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", active && "text-emerald-500")} />
      <span className="font-medium">{label}</span>
      {active && (
        <motion.div 
          layoutId="sidebar-active"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500"
        />
      )}
    </Link>
  );
}
