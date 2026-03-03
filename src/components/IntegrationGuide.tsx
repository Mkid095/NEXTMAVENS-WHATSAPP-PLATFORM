import React, { useState } from 'react';
import { Copy, Check, Terminal, Code2, Globe, BookOpen, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface IntegrationGuideProps {
  instanceId: string;
  apiKey?: string;
}

export function IntegrationGuide({ instanceId, apiKey = 'YOUR_API_KEY' }: IntegrationGuideProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = import.meta.env.VITE_API_URL || 'https://whatsappapi.nextmavens.cloud/api/v1';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const snippets = {
    curl: `curl -X POST "${baseUrl}/whatsapp/instances/${instanceId}/send" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "number": "1234567890",
    "text": "Hello from MAVENS API!"
  }'`,
    node: `const axios = require('axios');

const sendMessage = async () => {
  try {
    const response = await axios.post('${baseUrl}/whatsapp/instances/${instanceId}/send', {
      number: '1234567890',
      text: 'Hello from MAVENS API!'
    }, {
      headers: {
        'Authorization': 'Bearer ${apiKey}',
        'Content-Type': 'application/json'
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
};

sendMessage();`,
    python: `import requests

url = "${baseUrl}/whatsapp/instances/${instanceId}/send"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
data = {
    "number": "1234567890",
    "text": "Hello from MAVENS API!"
}

response = requests.post(url, json=data, headers=headers)
print(response.json())`
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-emerald-500/5 border-emerald-500/20 p-6">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
            <Globe className="w-6 h-6 text-emerald-500" />
          </div>
          <h4 className="font-bold text-white mb-2">Base URL</h4>
          <code className="text-xs text-emerald-400 break-all">{baseUrl}</code>
        </div>
        
        <div className="card bg-blue-500/5 border-blue-500/20 p-6">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
            <Terminal className="w-6 h-6 text-blue-500" />
          </div>
          <h4 className="font-bold text-white mb-2">Instance ID</h4>
          <code className="text-xs text-blue-400 break-all">{instanceId}</code>
        </div>

        <div className="card bg-purple-500/5 border-purple-500/20 p-6">
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6 text-purple-500" />
          </div>
          <h4 className="font-bold text-white mb-2">Documentation</h4>
          <a href="https://whatsappapi.nextmavens.cloud/docs" target="_blank" className="text-xs text-purple-400 flex items-center gap-1 hover:underline">
            View Full API Reference <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Code2 className="w-5 h-5 text-emerald-500" />
            Quick Start Snippets
          </h3>
        </div>

        <div className="space-y-8">
          {Object.entries(snippets).map(([lang, code]) => (
            <div key={lang} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{lang}</span>
                <button 
                  onClick={() => copyToClipboard(code, lang)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  {copied === lang ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied === lang ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <div className="relative group">
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 overflow-x-auto text-sm font-mono text-zinc-300 leading-relaxed">
                  {code}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card border-zinc-800 bg-zinc-900/50 p-8">
        <h3 className="text-lg font-bold text-white mb-4">Integration Workflow</h3>
        <div className="space-y-6">
          {[
            { step: '01', title: 'Create Instance', desc: 'Use the dashboard or API to create a new WhatsApp instance.' },
            { step: '02', title: 'Connect Account', desc: 'Scan the generated QR code with your WhatsApp mobile app.' },
            { step: '03', title: 'Generate API Key', desc: 'Create a specific API key for your integration in the "Access" tab.' },
            { step: '04', title: 'Start Messaging', desc: 'Use the endpoints provided above to send and receive messages.' }
          ].map((item) => (
            <div key={item.step} className="flex gap-6">
              <span className="text-3xl font-black text-zinc-800 italic">{item.step}</span>
              <div>
                <h5 className="font-bold text-zinc-200">{item.title}</h5>
                <p className="text-sm text-zinc-500 mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
