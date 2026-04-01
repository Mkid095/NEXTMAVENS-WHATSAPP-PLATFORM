/**
 * ApiEndpointCard - Card container for API endpoint documentation
 */

import React from 'react';
import { Terminal } from 'lucide-react';
import { CodeBlock } from './CodeBlock';

interface Props {
  title: string;
  description: string;
  endpoint: string;
  children: React.ReactNode;
}

export function ApiEndpointCard({ title, description, endpoint, children }: Props) {
  return (
    <div className="card p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4 text-emerald-500" />
          <h4 className="font-bold text-white">{title}</h4>
        </div>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2">
        <code className="text-xs text-emerald-400 font-mono">{endpoint}</code>
      </div>

      {children}
    </div>
  );
}
