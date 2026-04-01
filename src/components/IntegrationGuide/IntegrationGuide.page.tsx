/**
 * Integration Guide - Main container component
 */

import { useState } from 'react';
import { IntegrationGuideHeader } from './IntegrationGuideHeader';
import { QuickSetupSection } from './QuickSetupSection';
import { ApiReferenceSection } from './ApiReferenceSection';
import { IntegrationGuideFooter } from './IntegrationGuideFooter';
import { WebhookSetupSection } from './WebhookSetupSection';
import { createApiExamples } from './integrationGuideExamples';

interface Props {
  instanceId: string;
  apiKey?: string;
  webhookSecret?: string;
  phoneNumber?: string;
  status?: string;
}

export function IntegrationGuide({ instanceId, apiKey = 'YOUR_API_KEY', webhookSecret }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = import.meta.env.VITE_API_URL || 'https://whatsapp.nextmavens.cloud/api/v1';
  const apiExamples = createApiExamples(baseUrl, instanceId, apiKey);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8">
      <IntegrationGuideHeader instanceId={instanceId} />

      <QuickSetupSection apiKey={apiKey} webhookSecret={webhookSecret} />

      <ApiReferenceSection
        apiExamples={apiExamples}
        baseUrl={baseUrl}
        instanceId={instanceId}
        copyToClipboard={copyToClipboard}
        copied={copied}
      />

      {webhookSecret && (
        <WebhookSetupSection
          instanceId={instanceId}
          webhookSecret={webhookSecret}
          baseUrl={baseUrl}
        />
      )}

      <IntegrationGuideFooter />
    </div>
  );
}
