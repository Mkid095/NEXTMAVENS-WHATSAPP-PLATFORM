/**
 * WebhookSetupSection - Webhook configuration instructions
 */

import React from 'react';
import { AlertTriangle, Wrench, MessageSquare } from 'lucide-react';
import { CodeBlock } from './CodeBlock';

interface Props {
  instanceId: string;
  webhookSecret?: string;
  baseUrl: string;
}

export function WebhookSetupSection({ instanceId, webhookSecret, baseUrl }: Props) {
  const webhookPayloadExample = JSON.stringify({
    event: 'message.upsert',
    timestamp: new Date().toISOString(),
    instance: instanceId,
    data: {
      id: 'msg_123',
      from: '5511999999999@s.whatsapp.net',
      to: instanceId,
      body: 'Hello!',
      type: 'text',
      timestamp: Date.now()
    }
  }, null, 2);

  const signatureExample = `// Node.js - Verify webhook signature
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expected;
}`;

  return (
    <section className="space-y-4">
      <h3 className="text-xl font-bold text-white flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-emerald-500" />
        Webhook Configuration
      </h3>

      <div className="card p-6 space-y-6">
        <div className="flex items-start gap-4">
          <Wrench className="w-5 h-5 text-emerald-500 mt-0.5" />
          <div>
            <h4 className="font-bold text-white mb-2">Configure Your Webhook URL</h4>
            <p className="text-sm text-zinc-400 mb-4">
              Set your webhook endpoint URL in the instance settings to receive real-time notifications.
            </p>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
              <code className="text-sm text-zinc-300">
                https://your-server.com/webhooks/whatsapp
              </code>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
          <div>
            <h4 className="font-bold text-white mb-2">Verify Signatures</h4>
            <p className="text-sm text-zinc-400 mb-4">
              Always verify webhook signatures using your webhook secret to ensure requests are authentic.
            </p>
            <CodeBlock
              tabs={[
                { label: 'Node.js', code: signatureExample }
              ]}
              onCopy={(code) => {}}
              copied={null}
            />
          </div>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3">Example Payload</h4>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap">
              {webhookPayloadExample}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
