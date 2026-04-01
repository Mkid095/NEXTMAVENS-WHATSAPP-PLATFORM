/**
 * Integration Guide Header - Title and description
 */

import { BookOpen, ExternalLink } from 'lucide-react';

interface Props {
  instanceId: string;
}

export function IntegrationGuideHeader({ instanceId }: Props) {
  const baseUrl = import.meta.env.VITE_API_URL || 'https://whatsapp.nextmavens.cloud/api/v1';

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-white flex items-center gap-3">
        <BookOpen className="w-8 h-8 text-emerald-500" />
        Integration Guide
      </h1>
      <p className="text-zinc-400 max-w-3xl">
        Learn how to integrate your WhatsApp instance with your application. This guide covers authentication, API endpoints, webhook setup, and testing.
      </p>
      <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <ExternalLink className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div className="text-sm text-blue-200">
          <p className="font-medium">Base URL</p>
          <p className="text-xs text-blue-300/70 font-mono">{baseUrl}/whatsapp/public</p>
        </div>
      </div>
    </div>
  );
}
