import React from 'react';
import { Search, LayoutGrid, List } from 'lucide-react';
import { cn } from '../lib/utils';

interface DashboardFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
}

export function DashboardFilters({ 
  searchQuery, 
  setSearchQuery, 
  viewMode, 
  setViewMode 
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-800">
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input 
          type="text"
          placeholder="Search instances by name or number..."
          className="input w-full pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded-lg">
        <button 
          onClick={() => setViewMode('grid')}
          className={cn(
            "p-2 rounded-md transition-all",
            viewMode === 'grid' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setViewMode('list')}
          className={cn(
            "p-2 rounded-md transition-all",
            viewMode === 'list' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <List className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
