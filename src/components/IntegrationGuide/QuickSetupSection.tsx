/**
 * Quick Setup Section - API key and webhook secret cards
 */

import { Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  apiKey: string;
  webhookSecret?: string;
}

export function QuickSetupSection({ apiKey, webhookSecret }: Props) {
  return (
    <section className="space-y-4">
      <h3 className="text-xl font-bold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-500" />
        Quick Setup
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h4 className="font-bold text-white mb-2">1. Your API Key</h4>
          <code className="text-xs text-emerald-400 font-mono block bg-zinc-900 px-3 py-3 rounded break-all mb-3">
            {apiKey}
          </code>
          <p className="text-sm text-zinc-500">
            Include this in the <code className="text-zinc-300 bg-zinc-800 px-1 rounded">apikey</code> header for all requests.
          </p>
        </div>
        <div className="card">
          <h4 className="font-bold text-white mb-2">2. Webhook Secret</h4>
          <code className="text-xs text-purple-400 font-mono block bg-zinc-900 px-3 py-3 rounded break-all mb-3">
            {webhookSecret || 'Set a webhook secret in Settings to verify signatures'}
          </code>
          <p className="text-sm text-zinc-500">
            Use this to validate incoming webhook signatures.
          </p>
        </div>
      </div>
    </section>
  );
}
