/**
 * Integration Guide Code Examples
 * Static examples for API usage across different languages
 */

export interface ApiExamples {
  status: {
    curl: string;
    node: string;
    python: string;
  };
  sendMessage: {
    curl: string;
    node: string;
    python: string;
  };
  sendMedia: {
    curl: string;
    node: string;
    python: string;
  };
}

export function createApiExamples(baseUrl: string, instanceId: string, apiKey: string): ApiExamples {
  return {
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
};

sendMedia();`,
      python: `import requests

res = requests.post(
  "${baseUrl}/whatsapp/public/send/${instanceId}/media",
  json={
    "to": "+1234567890",
    "media": {
      "url": "https://example.com/image.jpg",
      "filename": "image.jpg",
      "mimetype": "image/jpeg"
    },
    "caption": "Check this out",
    "mediaType": "image"
  },
  headers={"apikey": "${apiKey}"}
)
print(res.json())`
    }
  };
}
