/**
 * Token Display - Shows the JWT token with copy and regenerate
 */

import React from 'react';
import { Copy, Check, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface Props {
  token: string | undefined;
  isLoading: boolean;
  error: any;
  tokenToCopy: string | null;
  onCopy: (token: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

export function TokenDisplay({
  token,
  isLoading,
  error,
  tokenToCopy,
  onCopy,
  onRegenerate,
  isRegenerating
}: Props) {
  return (
    <div className="card space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Reseller JWT Token</h3>
          <p className="text-sm text-zinc-500 mt-1">Use this token to authenticate Reseller API requests.</p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={isRegenerating || isLoading}
          className="btn-secondary flex items-center gap-2"
        >
          {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Regenerate
        </button>
      </div>

      {isLoading && !token && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      )}

      {error && !token && (
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400">Failed to load token</p>
          <button onClick={onRegenerate} className="btn-primary mt-4">
            Try Again
          </button>
        </div>
      )}

      {token && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative"
        >
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-zinc-400">Your Token</label>
            <button
              onClick={() => onCopy(token)}
              className="text-sm flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
            >
              {tokenToCopy === token ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {tokenToCopy === token ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <code className="text-sm font-mono block bg-zinc-900 border border-zinc-800 p-4 rounded-lg break-all text-zinc-300">
            {token}
          </code>
        </motion.div>
      )}
    </div>
  );
}
