import React, { useState } from 'react';
import { Copy, Check, Terminal, Code2, Globe, BookOpen, ExternalLink, Key, Wrench, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface IntegrationGuideProps {
  instanceId: string;
  apiKey?: string;
  webhookSecret?: string;
  phoneNumber?: string;
  status?: string;
}

export function IntegrationGuide({ instanceId, apiKey = 'YOUR_API_KEY', webhookSecret, phoneNumber, status }: IntegrationGuideProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = import.meta.env.VITE_API_URL || 'https://whatsappapi.nextmavens.cloud/api/v1';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Public API endpoints (using instance API key, not JWT)
  const apiExamples = {
    status: {
      curl: `curl -X GET "${baseUrl}/whatsapp/public/status/${instanceId}" \\
  -H "apikey: ${apiKey}"`,
      node: `const axios = require('axios');

const checkStatus = async () => {
  const res = await axios.get('${baseUrl}/whatsapp/public/status/${instanceId}', {
    headers: { 'apikey': '${apiKey}' }
  });
  console.log(res.data);
};

checkStatus();`,
      python: `import requests

res = requests.get(
  "${baseUrl}/whatsapp/public/status/${instanceId}",
  headers={"apikey": "${apiKey}"}
)
print(res.json())`
    },
    sendMessage: {
      curl: `curl -X POST "${baseUrl}/whatsapp/public/send/${instanceId}" \\
  -H "apikey: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "content": "Hello!"
  }'`,
      node: `const axios = require('axios');

const sendMessage = async () => {
  const res = await axios.post(
    '${baseUrl}/whatsapp/public/send/${instanceId}',
    { to: '+1234567890', content: 'Hello!' },
    { headers: { 'apikey': '${apiKey}' } }
  );
  console.log(res.data);
};

sendMessage();`,
      python: `import requests

res = requests.post(
  "${baseUrl}/whatsapp/public/send/${instanceId}",
  json={"to": "+1234567890", "content": "Hello!"},
  headers={"apikey": "${apiKey}"}
)
print(res.json())`
    },
    sendMedia: {
      curl: `curl -X POST "${baseUrl}/whatsapp/public/send/${instanceId}/media" \\
  -H "apikey: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "media": {
      "url": "https://example.com/image.jpg",
      "filename": "image.jpg",
      "mimetype": "image/jpeg"
    },
    "caption": "Check this out",
    "mediaType": "image"
  }'`,
      node: `const axios = require('axios');

const sendMedia = async () => {
  const res = await axios.post(
    '${baseUrl}/whatsapp/public/send/${instanceId}/media',
    {
      to: '+1234567890',
      media: { url: 'https://example.com/image.jpg', filename: 'image.jpg', mimetype: 'image/jpeg' },
      caption: 'Check this out',
      mediaType: 'image'
    },
    { headers: { 'apikey': '${apiKey}' } }
  );
  console.log(res.data);
};`,
      python: `import requests

res = requests.post(
  "${baseUrl}/whatsapp/public/send/${instanceId}/media",
  json={
    "to": "+1234567890",
    "media": {"url": "https://example.com/image.jpg", "filename": "image.jpg", "mimetype": "image/jpeg"},
    "caption": "Check this out",
    "mediaType": "image"
  },
  headers={"apikey": "${apiKey}"}
)
print(res.json())`
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border-emerald-500/20 p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Integration Guide</h2>
            <p className="text-zinc-400">Your WhatsApp API instance is ready. Use the following credentials to integrate.</p>
          </div>
          {status && (
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
              status === 'CONNECTED' ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"
            )}>
              {status}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* API Key */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">API Key</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-sm text-emerald-400 font-mono flex-1 truncate" title={apiKey}>
                {apiKey}
              </code>
              <button
                onClick={() => copyToClipboard(apiKey, 'apiKey')}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-all"
              >
                {copied === 'apiKey' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">Use in <code className="text-zinc-400">apikey</code> header</p>
          </div>

          {/* Base URL */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Base URL</span>
            </div>
            <code className="text-sm text-blue-400 font-mono block truncate">{baseUrl}</code>
            <p className="text-[10px] text-zinc-600 mt-2">Public API endpoints</p>
          </div>

          {/* Instance ID */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Instance ID</span>
            </div>
            <code className="text-sm text-purple-400 font-mono block truncate">{instanceId}</code>
            <p className="text-[10px] text-zinc-600 mt-2">Use in URL path</p>
          </div>
        </div>
      </div>

      {/* Quick Start Snippets */}
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Code2 className="w-5 h-5 text-emerald-500" />
          Public API Examples
        </h3>
        <p className="text-zinc-500 text-sm">These examples use the <strong className="text-white">apikey</strong> header with your instance-specific key.</p>

        <div className="space-y-8">
          {Object.entries(apiExamples).map(([category, examples]) => (
            <div key={category} className="space-y-3">
              <h4 className="text-lg font-semibold text-white capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}</h4>
              {Object.entries(examples).map(([lang, code]) => (
                <div key={lang} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{lang}</span>
                    <button
                      onClick={() => copyToClipboard(code as string, `${category}-${lang}`)}
                      className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      {copied === `${category}-${lang}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copied === `${category}-${lang}` ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                  <div className="relative">
                    <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 overflow-x-auto text-sm font-mono text-zinc-300 leading-relaxed">
                      {code as string}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Section */}
      {webhookSecret && (
        <div className="card border-zinc-800 p-6">
          <h4 className="font-bold text-white mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-500" />
            Webhook Configuration
          </h4>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4">
            <p className="text-sm text-yellow-400">
              <strong>Important:</strong> Use this secret to verify webhook signatures. Store it securely on your server.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Webhook Secret</p>
              <div className="flex items-center gap-2">
                <code className="text-sm text-yellow-400 font-mono flex-1 bg-zinc-900 px-3 py-2 rounded truncate">
                  {webhookSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookSecret, 'webhookSecret')}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-all"
                >
                  {copied === 'webhookSecret' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Expected Events</p>
              <div className="flex flex-wrap gap-2">
                {['connection.status', 'messages.upsert', 'messages.update', 'contacts.upsert', 'groups.update'].map(event => (
                  <span key={event} className="px-2 py-1 bg-zinc-800 text-xs text-zinc-300 rounded">
                    {event}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integration Steps */}
      <div className="card border-zinc-800 bg-zinc-900/50 p-8">
        <h3 className="text-lg font-bold text-white mb-4">Integration Steps</h3>
        <div className="space-y-6">
          {[
            { step: '01', title: 'Test Connection', desc: 'Use the API examples above to verify your instance is connected and responding.' },
            { step: '02', title: 'Configure Webhook', desc: webhookSecret ? 'Set your webhook endpoint URL in Settings > Webhooks to receive real-time events. Use the secret above to verify signatures.' : 'Add a webhook URL in Settings to receive real-time events (messages, status updates). A secret will be generated for signature verification.' },
            { step: '03', title: 'Start Sending Messages', desc: 'Integrate the public API into your application using the provided code examples.' },
            { step: '04', title: 'Monitor & Scale', desc: 'Track message volume, errors, and performance in the Analytics section.' }
          ].map((item) => (
            <div key={item.step} className="flex gap-6">
              <span className="text-emerald-500 font-mono text-lg">{item.step}</span>
              <div>
                <h5 className="font-bold text-zinc-200">{item.title}</h5>
                <p className="text-sm text-zinc-500 mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documentation Link */}
      <div className="card bg-blue-500/5 border-blue-500/20 p-6 text-center">
        <BookOpen className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">Need More Details?</h3>
        <p className="text-zinc-400 mb-4">Check the complete API reference for all available endpoints and parameters.</p>
        <a
          href="https://whatsappapi.nextmavens.cloud/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          View Full Documentation
        </a>
      </div>
    </div>
  );
}
