/**
 * API Reference Section - All API endpoint examples
 */

import { Globe } from 'lucide-react';
import { ApiEndpointCard } from './ApiEndpointCard';
import { CodeBlock } from './CodeBlock';

interface ApiExample {
  curl: string;
  node: string;
  python: string;
}

interface Props {
  apiExamples: {
    status: ApiExample;
    sendMessage: ApiExample;
    sendMedia: ApiExample;
  };
  baseUrl: string;
  instanceId: string;
  copyToClipboard: (text: string, id: string) => void;
  copied: string | null;
}

export function ApiReferenceSection({
  apiExamples,
  baseUrl,
  instanceId,
  copyToClipboard,
  copied
}: Props) {
  return (
    <section className="space-y-4">
      <h3 className="text-xl font-bold text-white flex items-center gap-2">
        <Globe className="w-5 h-5 text-emerald-500" />
        API Reference
      </h3>
      <div className="space-y-4">
        <ApiEndpointCard
          title="Check Instance Status"
          description="Verify your instance connection status"
          endpoint={`GET ${baseUrl}/whatsapp/public/status/{instanceId}`}
        >
          <CodeBlock
            tabs={[
              { label: 'cURL', code: apiExamples.status.curl },
              { label: 'Node.js', code: apiExamples.status.node },
              { label: 'Python', code: apiExamples.status.python }
            ]}
            onCopy={(code) => copyToClipboard(code, 'status-' + code.substring(0, 10))}
            copied={copied}
          />
        </ApiEndpointCard>

        <ApiEndpointCard
          title="Send Message"
          description="Send a text message to a WhatsApp number"
          endpoint={`POST ${baseUrl}/whatsapp/public/send/{instanceId}`}
        >
          <CodeBlock
            tabs={[
              { label: 'cURL', code: apiExamples.sendMessage.curl },
              { label: 'Node.js', code: apiExamples.sendMessage.node },
              { label: 'Python', code: apiExamples.sendMessage.python }
            ]}
            onCopy={(code) => copyToClipboard(code, 'send-' + code.substring(0, 10))}
            copied={copied}
          />
        </ApiEndpointCard>

        <ApiEndpointCard
          title="Send Media"
          description="Send images, videos, documents, or audio"
          endpoint={`POST ${baseUrl}/whatsapp/public/send/{instanceId}/media`}
        >
          <CodeBlock
            tabs={[
              { label: 'cURL', code: apiExamples.sendMedia.curl },
              { label: 'Node.js', code: apiExamples.sendMedia.node },
              { label: 'Python', code: apiExamples.sendMedia.python }
            ]}
            onCopy={(code) => copyToClipboard(code, 'media-' + code.substring(0, 10))}
            copied={copied}
          />
        </ApiEndpointCard>
      </div>
    </section>
  );
}
