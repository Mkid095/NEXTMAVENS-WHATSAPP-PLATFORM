/**
 * CodeBlock - Reusable syntax-highlighted code block with tabs
 */

import React, { useState } from 'react';
import { Copy, Check, Code } from 'lucide-react';

interface Tab {
  label: string;
  code: string;
}

interface Props {
  tabs: Tab[];
  onCopy: (code: string) => void;
  copied: string | null;
}

export function CodeBlock({ tabs, onCopy, copied }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="mt-4 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Tabs Header */}
      <div className="flex bg-zinc-900/80 border-b border-zinc-800">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(idx)}
            className={`
              flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all
              ${activeTab === idx
                ? 'bg-zinc-800 text-white border-b-2 border-emerald-500'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}
            `}
          >
            <Code className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Code Content */}
      <div className="relative">
        <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
          <code className="text-zinc-300 font-mono">{tabs[activeTab].code}</code>
        </pre>
        <button
          onClick={() => onCopy(tabs[activeTab].code)}
          className="absolute top-3 right-3 p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-all"
          title="Copy code"
        >
          {copied === tabs[activeTab].code.substring(0, 20) ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
