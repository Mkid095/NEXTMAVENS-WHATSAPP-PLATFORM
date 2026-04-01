/**
 * Instance Header - Title, status, and reseller token section
 */

import React, { useState } from 'react';
import { Copy, Check, RefreshCw, ExternalLink, ArrowLeft, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WhatsAppInstance } from '../../types';

interface Props {
  instance: WhatsAppInstance;
  onBack: () => void;
  resellerTokenData: any;
  isLoadingResellerToken: boolean;
  onRefetchResellerToken: () => void;
  isResellerNotConfigured: boolean;
  navigate: (path: string) => void;
}

export function InstanceHeader({
  instance,
  onBack,
  resellerTokenData,
  isLoadingResellerToken,
  onRefetchResellerToken,
  isResellerNotConfigured,
  navigate
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{instance.name}</h1>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
              instance.status === 'CONNECTED' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>
              {instance.status}
            </span>
          </div>
          <p className="text-zinc-500 mt-1 text-sm">ID: {instance.id}</p>
        </div>
      </div>

      {/* Reseller JWT Token Quick Access */}
      <div className="hidden md:block">
        {isLoadingResellerToken && !resellerTokenData ? (
          <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800/50 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-500" />
            <span className="text-sm text-zinc-500">Loading token...</span>
          </div>
        ) : isResellerNotConfigured ? (
          <button
            onClick={() => navigate('/reseller-api')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-500 rounded-lg hover:bg-purple-500/20 transition-all text-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            Configure Reseller API
          </button>
        ) : resellerTokenData?.token ? (
          <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2">
            <code className="text-xs text-purple-400 font-mono px-2">{resellerTokenData.token.substring(0, 20)}...</code>
            <button
              onClick={() => copyKey(resellerTokenData.token!)}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-all"
            >
              {copiedKey === resellerTokenData.token ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
