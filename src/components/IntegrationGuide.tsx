import React, { useState } from 'react';
import { Copy, Check, Terminal, Code2, Globe, BookOpen, ExternalLink, Key, Wrench, AlertTriangle, Rocket, Settings, Activity, MessageSquare, Users } from 'lucide-react';
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
    },
    // ==========================================
    // BULK MESSAGING (High-Volume Sending)
    // ==========================================
    // IMPORTANT: Bulk endpoints require JWT authentication (Bearer token)
    // NOT the instance API key. Use your dashboard JWT token.
    bulkMessaging: {
      overview: `Bulk messaging allows you to send thousands of messages efficiently with controlled concurrency, automatic retries, and real-time progress tracking.

Key Features:
• Send to 10,000+ recipients in a single job
• Configurable batch size (1-100 concurrent)
• Rate limiting with delays between batches
• Real-time progress via SSE
• Detailed job status and message-level tracking
• Automatic retry for failed messages

Rate Limits (configurable):
• 10 jobs per minute
• 100 jobs per hour
• 1000 jobs per day`,
      curl: `# Submit Bulk Job
curl -X POST "${baseUrl}/whatsapp/instances/${instanceId}/send-bulk" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "numbers": ["+1234567890", "+0987654321"],
    "text": "Hello {name}! Special offer just for you.",
    "batchSize": 50,
    "delayBetweenBatchesMs": 2000,
    "options": {
      "maxRetries": 3,
      "delayBetweenRetriesMs": 5000
    }
  }'

# Check Job Status
curl -X GET "${baseUrl}/whatsapp/instances/${instanceId}/bulk/{jobId}?includeMessages=true" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Cancel Job
curl -X POST "${baseUrl}/whatsapp/instances/${instanceId}/bulk/{jobId}/cancel" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# List Bulk Jobs
curl -X GET "${baseUrl}/whatsapp/instances/${instanceId}/bulk?status=COMPLETED&limit=50" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `// Bulk Messaging with Real-Time Monitoring
const axios = require('axios');

const API_BASE = '${baseUrl}';
const JWT_TOKEN = 'YOUR_JWT_TOKEN'; // From dashboard login
const INSTANCE_ID = '${instanceId}';

// 1. Submit bulk job
async function submitBulkJob() {
  const response = await axios.post(
    API_BASE + '/whatsapp/instances/' + INSTANCE_ID + '/send-bulk',
    {
      numbers: ['+1234567890', '+0987654321' /*, ... more */],
      text: 'Hello {name}! This is a bulk message.',
      batchSize: 50,
      delayBetweenBatchesMs: 2000,
      options: { maxRetries: 3, delayBetweenRetriesMs: 5000 }
    },
    {
      headers: {
        'Authorization': 'Bearer ' + JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  console.log('Job submitted:', response.data);
  return response.data.jobId;
}

// 2. Monitor via SSE
function monitorProgress(jobId) {
  const eventSource = new EventSource(API_BASE + '/whatsapp/stream?token=' + JWT_TOKEN);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.jobId === jobId) {
      console.log('[' + data.status + '] ' + data.phone);
      if (data.status === 'COMPLETED') {
        console.log('Job complete!', data.summary);
        eventSource.close();
      }
    }
  };
}

// 3. Check status & cancel as needed`,
      python: `# Bulk Messaging (Python)
import requests
import json

API_BASE = '${baseUrl}'
JWT_TOKEN = 'YOUR_JWT_TOKEN'
INSTANCE_ID = '${instanceId}'

headers = {'Authorization': f'Bearer {JWT_TOKEN}'}

# Submit job
response = requests.post(
    f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}/send-bulk",
    json={
        'numbers': ['+1234567890', '+0987654321'],
        'text': 'Hello!',
        'batchSize': 50,
        'delayBetweenBatchesMs': 2000
    },
    headers=headers
)
job_id = response.json()['jobId']
print(f'Job created: {job_id}')

# Check status
response = requests.get(
    f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}/bulk/{job_id}",
    headers=headers
)
print(json.dumps(response.json(), indent=2))

# Cancel if needed
# requests.post(f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}/bulk/{job_id}/cancel", headers=headers)`
    },
    // ==========================================
    // INSTANCE MANAGEMENT (Admin Operations)
    // ==========================================
    instanceManagement: {
      overview: `Manage your WhatsApp instance using these admin endpoints.

All instance management endpoints require JWT authentication (Bearer token).`,
      curl: `# Get Instance Details
curl -X GET "${baseUrl}/whatsapp/instances/${instanceId}" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get API Credentials (for public API)
curl -X GET "${baseUrl}/whatsapp/instances/${instanceId}/keys" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Connect Instance (Get QR Code)
curl -X POST "${baseUrl}/whatsapp/instances/${instanceId}/connect" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Disconnect Instance
curl -X POST "${baseUrl}/whatsapp/instances/${instanceId}/disconnect" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Regenerate QR Code
curl -X POST "${baseUrl}/whatsapp/instances/${instanceId}/qr/regenerate" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Update Instance Settings
curl -X PUT "${baseUrl}/whatsapp/instances/${instanceId}" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Updated Name",
    "webhookUrl": "https://your-server.com/webhooks",
    "webhookByEvents": true,
    "rejectCalls": false,
    "groupsIgnore": false
  }'

# Delete Instance
curl -X DELETE "${baseUrl}/whatsapp/instances/${instanceId}" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const axios = require('axios');

const API_BASE = '${baseUrl}';
const JWT_TOKEN = 'YOUR_JWT_TOKEN';
const INSTANCE_ID = '${instanceId}';

// Connect and get QR code
async function connectInstance() {
  const res = await axios.post(
    API_BASE + '/whatsapp/instances/' + INSTANCE_ID + '/connect',
    {},
    { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } }
  );
  console.log('QR Code:', res.data.qrCode);
  console.log('Pairing Code:', res.data.pairingCode);
}

// Get API credentials (for public API)
async function getCredentials() {
  const res = await axios.get(
    API_BASE + '/whatsapp/instances/' + INSTANCE_ID + '/keys',
    { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } }
  );
  console.log('API Key:', res.data.credentials.apiKey);
}

// Update settings
async function updateInstance() {
  const res = await axios.put(
    API_BASE + '/whatsapp/instances/' + INSTANCE_ID,
    {
      name: 'New Name',
      webhookUrl: 'https://your-server.com/webhooks',
      webhookByEvents: true
    },
    { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } }
  );
  console.log('Updated:', res.data.instance);
}`,
      python: `import requests

API_BASE = '${baseUrl}'
JWT_TOKEN = 'YOUR_JWT_TOKEN'
INSTANCE_ID = '${instanceId}'

headers = {'Authorization': f'Bearer {JWT_TOKEN}'}

# Get credentials
res = requests.get(f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}/keys", headers=headers)
print('API Key:', res.json()['credentials']['apiKey'])

# Connect
res = requests.post(f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}/connect", headers=headers)
print('QR Code:', res.json()['qrCode'])

# Update
res = requests.put(
    f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}",
    json={'name': 'New Name', 'webhookUrl': 'https://example.com/webhook'},
    headers=headers
)
print('Updated:', res.json())`
    },
    // ==========================================
    // GET CREDENTIALS (API Key for Public API)
    // ==========================================
    getCredentials: {
      curl: `curl -X GET "${baseUrl}/whatsapp/instances/${instanceId}/keys" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const res = await axios.get(
  API_BASE + '/whatsapp/instances/' + INSTANCE_ID + '/keys',
  { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } }
);
console.log('API Key:', res.data.credentials.apiKey);`,
      python: `res = requests.get(
    f"{API_BASE}/whatsapp/instances/{INSTANCE_ID}/keys",
    headers=headers
)
print('API Key:', res.json()['credentials']['apiKey'])`
    },
    // ==========================================
    // REAL-TIME STREAMING (SSE)
    // ==========================================
    streaming: {
      overview: `Subscribe to real-time events using Server-Sent Events (SSE). All events for all instances are streamed in a single connection.

Requires JWT authentication.`,
      curl: `curl -N "${baseUrl}/whatsapp/stream?token=YOUR_JWT_TOKEN" \\
  -H "Accept: text/event-stream"`,
      node: `const eventSource = new EventSource(API_BASE + '/whatsapp/stream?token=' + JWT_TOKEN);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);

  switch (data.event) {
    case 'connection.status':
      console.log(\`Instance \${data.instance} is now \${data.data.status}\`);
      break;
    case 'messages.upsert':
      console.log('New message from', data.data.messages[0].from);
      break;
    case 'messages.update':
      console.log('Message status:', data.data.messages[0].status);
      break;
    case 'contacts.upsert':
      console.log('Contact updated:', data.data.contacts[0].id);
      break;
    case 'groups.update':
      console.log('Group updated:', data.data.groups[0].name);
      break;
    case 'presence.update':
      console.log('Presence change:', data.data);
      break;
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};`,
      python: `# SSE streaming requires special handling (see documentation)
# Recommended: Use an SSE client library like 'eventsource' or 'sseclient'
# or implement manually with long-polling.
print("See documentation for SSE implementation details.")`
    },
    // ==========================================
    // WEBHOOK EVENTS
    // ==========================================
    webhookEvents: {
      overview: `Configure webhooks to receive real-time events at your endpoint. Set webhookUrl and webhookSecret in instance settings.

All webhook requests include X-Evolution-Signature header for verification.`,
      events: [
        { name: 'connection.status', desc: 'Instance connection status changed (CONNECTED, DISCONNECTED, QR_READY, etc.)' },
        { name: 'messages.upsert', desc: 'New incoming message received' },
        { name: 'messages.update', desc: 'Message status updated (sent, delivered, read, failed)' },
        { name: 'contacts.upsert', desc: 'Contact added or updated' },
        { name: 'groups.update', desc: 'Group information changed' },
        { name: 'qrcode.updated', desc: 'New QR code is available (auto-regeneration)' },
        { name: 'presence.update', desc: 'User online/offline status changed' }
      ],
      signatureVerification: `// Verify webhook signature (Node.js)
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return signature === expected;
}

// Express.js example
app.post('/webhooks/whatsapp', (req, res) => {
  const signature = req.headers['x-evolution-signature'];
  const secret = 'YOUR_WEBHOOK_SECRET';

  if (!verifyWebhook(JSON.stringify(req.body), signature, secret)) {
    return res.status(401).send('Invalid signature');
  }

  // Process event
  console.log('Event:', req.body.event);
  res.status(200).send('OK');
});`
    },
    // ==========================================
    // CHATS & MESSAGES
    // ==========================================
    chats: {
      curl: `# Get all chats
curl -X GET "${baseUrl}/whatsapp/public/chats/${instanceId}?limit=50" \\
  -H "apikey: ${apiKey}"

# Get chat messages
curl -X GET "${baseUrl}/whatsapp/public/chats/${instanceId}/1234567890@s.whatsapp.net?limit=100" \\
  -H "apikey: ${apiKey}"

# Archive chat
curl -X POST "${baseUrl}/whatsapp/public/chats/${instanceId}/1234567890@s.whatsapp.net/archive" \\
  -H "apikey: ${apiKey}"

# Mark as read
curl -X POST "${baseUrl}/whatsapp/public/chats/${instanceId}/1234567890@s.whatsapp.net/read" \\
  -H "apikey: ${apiKey}"`,
      node: `const axios = require('axios');
const client = axios.create({
  baseURL: API_BASE,
  headers: { 'apikey': apiKey }
});

// Get chats
const chats = await client.get('/whatsapp/public/chats/' + INSTANCE_ID + '?limit=50');
console.log(chats.data);

// Get messages for specific chat
const messages = await client.get('/whatsapp/public/chats/' + INSTANCE_ID + '/1234567890@s.whatsapp.net?limit=100');
console.log(messages.data);`,
      python: `import requests

headers = {'apikey': apiKey}

# Get chats
res = requests.get(f"{API_BASE}/whatsapp/public/chats/{INSTANCE_ID}?limit=50", headers=headers)
print(res.json())

# Get messages
res = requests.get(f"{API_BASE}/whatsapp/public/chats/{INSTANCE_ID}/1234567890@s.whatsapp.net?limit=100", headers=headers)
print(res.json())`
    },
    // ==========================================
    // CONTACTS
    // ==========================================
    contacts: {
      curl: `# Get all contacts
curl -X GET "${baseUrl}/whatsapp/public/contacts/${instanceId}?limit=100" \\
  -H "apikey: ${apiKey}"

# Get specific contact
curl -X GET "${baseUrl}/whatsapp/public/contacts/${instanceId}/+1234567890" \\
  -H "apikey: ${apiKey}"

# Update contact
curl -X PUT "${baseUrl}/whatsapp/public/contacts/${instanceId}/+1234567890" \\
  -H "apikey: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "John Doe", "pushName": "John"}'`,
      node: `const axios = require('axios');
const client = axios.create({
  baseURL: API_BASE,
  headers: { 'apikey': apiKey }
});

// Get all contacts
const contacts = await client.get('/whatsapp/public/contacts/' + INSTANCE_ID + '?limit=100');
console.log(contacts.data);

// Update contact
await client.put('/whatsapp/public/contacts/' + INSTANCE_ID + '/+1234567890', {
  name: 'John Doe',
  pushName: 'John'
});`,
      python: `import requests

headers = {'apikey': apiKey}

# Get contacts
res = requests.get(f"{API_BASE}/whatsapp/public/contacts/{INSTANCE_ID}?limit=100", headers=headers)
print(res.json())

# Update contact
res = requests.put(
    f"{API_BASE}/whatsapp/public/contacts/{INSTANCE_ID}/+1234567890",
    json={'name': 'John Doe', 'pushName': 'John'},
    headers=headers
)
print(res.json())`
    },
    // ==========================================
    // GROUPS
    // ==========================================
    groups: {
      curl: `# Get all groups
curl -X GET "${baseUrl}/whatsapp/groups/${instanceId}" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get group info
curl -X GET "${baseUrl}/whatsapp/groups/${instanceId}/{groupId}" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create group
curl -X POST "${baseUrl}/whatsapp/groups/${instanceId}" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject": "My Group",
    "participants": ["+1234567890", "+0987654321"]
  }'

# Add participants
curl -X POST "${baseUrl}/whatsapp/groups/${instanceId}/{groupId}/participants" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"participants": ["+1111111111"]}'

# Remove participants
curl -X DELETE "${baseUrl}/whatsapp/groups/${instanceId}/{groupId}/participants" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"participants": ["+1111111111"]}'`,
      node: `const axios = require('axios');
const API_BASE = '${baseUrl}';
const JWT_TOKEN = 'YOUR_JWT_TOKEN';

// Get all groups
const groups = await axios.get(
  API_BASE + '/api/v1/whatsapp/groups/' + INSTANCE_ID,
  { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } }
);
console.log(groups.data);

// Create group
const newGroup = await axios.post(
  API_BASE + '/api/v1/whatsapp/groups/' + INSTANCE_ID,
  {
    subject: 'My Group',
    participants: ['+1234567890', '+0987654321']
  },
  { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } }
);
console.log(newGroup.data);`,
      python: `import requests

API_BASE = '${baseUrl}'
JWT_TOKEN = 'YOUR_JWT_TOKEN'
headers = {'Authorization': f'Bearer {JWT_TOKEN}'}

# Get groups
res = requests.get(f"{API_BASE}/api/v1/whatsapp/groups/{INSTANCE_ID}", headers=headers)
print(res.json())

# Create group
res = requests.post(
    f"{API_BASE}/api/v1/whatsapp/groups/{INSTANCE_ID}",
    json={'subject': 'My Group', 'participants': ['+1234567890']},
    headers=headers
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
          {Object.entries(apiExamples).map(([category, examples]: [string, any]) => {
            // Get category icon
            const getIcon = () => {
              switch (category) {
                case 'bulkMessaging': return <Rocket className="w-5 h-5 text-purple-500" />;
                case 'instanceManagement': return <Settings className="w-5 h-5 text-blue-500" />;
                case 'streaming': return <Activity className="w-5 h-5 text-green-500" />;
                case 'webhookEvents': return <Wrench className="w-5 h-5 text-yellow-500" />;
                case 'chats': return <MessageSquare className="w-5 h-5 text-indigo-500" />;
                case 'contacts': return <Users className="w-5 h-5 text-pink-500" />;
                case 'groups': return <Users className="w-5 h-5 text-orange-500" />;
                default: return <Code2 className="w-5 h-5 text-emerald-500" />;
              }
            };

            return (
              <div key={category} className="space-y-4">
                <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                  {getIcon()}
                  {category.replace(/([A-Z])/g, ' $1').trim()}
                </h4>

                {/* Overview/Description for special categories */}
                {examples.overview && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <p className="text-sm text-blue-200 whitespace-pre-line">{examples.overview}</p>
                  </div>
                )}

                {/* Webhook Events List */}
                {examples.events && (
                  <div className="space-y-3">
                    <h5 className="font-bold text-zinc-300">Available Events</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {examples.events.map((evt: { name: string; desc: string }, idx: number) => (
                        <div key={idx} className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                          <code className="text-xs text-emerald-400 font-mono">{evt.name}</code>
                          <p className="text-sm text-zinc-400 mt-1">{evt.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code Examples */}
                {Object.entries(examples)
                  .filter(([, code]: [string, any]) => typeof code === 'string' && code.trim())
                  .map(([lang, code]) => (
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
            );
          })}
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
                {['connection.status', 'messages.upsert', 'messages.update', 'contacts.upsert', 'groups.update', 'qrcode.updated', 'presence.update'].map(event => (
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
