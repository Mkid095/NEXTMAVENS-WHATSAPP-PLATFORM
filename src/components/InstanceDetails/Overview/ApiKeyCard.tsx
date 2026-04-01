/**
 * API Key Card - Shows WhatsApp API key
 */

import { Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  apiKey: string | undefined;
  copiedKey: string | null;
  onCopy: (key: string) => void;
}

export function ApiKeyCard({ apiKey, copiedKey, onCopy }: Props) {
  return (
    <div className="card bg-blue-500/5 border-blue-500/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-blue-500">WhatsApp API Key</h3>
        <button
          onClick={() => onCopy(apiKey || '')}
          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
        >
          {copiedKey === apiKey ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-3">Use this key in the <code className="text-zinc-300 bg-zinc-800 px-1 rounded">apikey</code> header for public API calls.</p>
      <code className="text-sm text-blue-400 font-mono block bg-zinc-900 px-3 py-3 rounded break-all">
        {apiKey || 'Not generated yet. Connect your device to generate API key.'}
      </code>
    </div>
  );
}
