/**
 * Integration Guide Tab - Placeholder for integration documentation
 */

import React from 'react';
import { Code2 } from 'lucide-react';

interface IntegrationGuideTabProps {
  instanceId: string;
  apiKey: string;
  webhookSecret: string;
}

export function IntegrationGuideTab({ instanceId, apiKey, webhookSecret }: IntegrationGuideTabProps) {
  return (
    <div className="card p-8 text-center">
      <Code2 className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-white mb-2">Integration Guide</h3>
      <p className="text-zinc-500 max-w-md mx-auto">
        Step-by-step instructions for integrating your application with the WhatsApp API will appear here.
      </p>
    </div>
  );
}
