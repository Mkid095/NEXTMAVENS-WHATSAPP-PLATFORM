/**
 * Reseller Token Card - Shows and manages reseller JWT token
 */

import { RefreshCw, Loader2, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

interface Props {
  token: string | undefined;
  expiresAt: string | undefined;
  isLoading: boolean;
  isError: boolean;
  copiedKey: string | null;
  onCopy: (token: string) => void;
  onRefetch: () => void;
  onNavigate: (path: string) => void;
}

export function ResellerTokenCard({
  token,
  expiresAt,
  isLoading,
  isError,
  copiedKey,
  onCopy,
  onRefetch,
  onNavigate
}: Props) {
  const isResellerNotConfigured = isError;

  return (
    <div className="card bg-purple-500/5 border-purple-500/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-purple-500">Reseller JWT Token</h3>
        <button
          onClick={() => onRefetch()}
          disabled={isLoading}
          className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg transition-all flex items-center gap-1"
        >
          {isLoading ? (
            <>Refreshing...</>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              Refresh
            </>
          )}
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-3">
        Use this token to authenticate Reseller API requests for creating and managing sub-instances.
      </p>
      {isLoading && !token ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        </div>
      ) : isResellerNotConfigured ? (
        <div className="text-center py-4">
          <p className="text-red-400 mb-3">
            Reseller API not configured by platform administrator.
          </p>
          <button
            onClick={() => onNavigate('/reseller-api')}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <ExternalLink className="w-3 h-3" />
            Go to Reseller API Settings
          </button>
        </div>
      ) : token ? (
        <div>
          <code className="text-sm text-purple-400 font-mono block bg-zinc-900 px-3 py-3 rounded break-all">
            {token}
          </code>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-zinc-500">
              Expires: {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'N/A'}
            </p>
            <button
              onClick={() => onCopy(token)}
              className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
            >
              {copiedKey === token ? (
                <span className="flex items-center gap-1 text-emerald-500">
                  <Check className="w-3 h-3" /> Copied!
                </span>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> Copy
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-zinc-500 mb-3">No Reseller JWT token generated yet.</p>
          <button
            onClick={() => onNavigate('/reseller-api')}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <ExternalLink className="w-3 h-3" />
            Generate Token
          </button>
        </div>
      )}
    </div>
  );
}
