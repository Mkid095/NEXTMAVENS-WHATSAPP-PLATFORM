/**
 * Info Card - Usage instructions and details
 */

import React from 'react';
import { Info, FileText, ExternalLink } from 'lucide-react';

export function InfoCard() {
  return (
    <div className="card bg-blue-500/5 border-blue-500/20">
      <h3 className="font-bold text-blue-500 mb-4 flex items-center gap-2">
        <Info className="w-4 h-4" />
        How to Use
      </h3>
      <ul className="space-y-3 text-sm text-zinc-400">
        <li className="flex items-start gap-2">
          <span className="text-blue-500 mt-1">•</span>
          <span>Include the token in the <code className="bg-zinc-800 px-1 rounded text-xs">Authorization: Bearer &lt;token&gt;</code> header.</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-500 mt-1">•</span>
          <span>Use the token to create and manage sub-instances via the Reseller API.</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-500 mt-1">•</span>
          <span>Keep this token secret - do not expose it in client-side code.</span>
        </li>
      </ul>

      <div className="mt-6 pt-6 border-t border-blue-500/10">
        <a
          href="/docs/reseller-api"
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <FileText className="w-4 h-4" />
          View Reseller API Documentation
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
