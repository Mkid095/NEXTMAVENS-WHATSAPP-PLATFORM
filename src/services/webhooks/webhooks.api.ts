/**
 * Webhooks API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppWebhook, WebhookDelivery } from '../../types';

export interface UpsertWebhookData {
  url: string;
  enabled?: boolean;
  byEvents?: boolean;
  base64?: boolean;
  events?: string[];
}

export class WebhooksApi {
  private api = getApiService().getAxios();

  async fetchByInstance(instanceId: string): Promise<WhatsAppWebhook[]> {
    const res = await this.api.get<{ webhooks: WhatsAppWebhook[] }>(`whatsapp/instances/${instanceId}/webhooks`);
    return res.data.webhooks || [];
  }

  async upsert(instanceId: string, data: UpsertWebhookData): Promise<WhatsAppWebhook> {
    const res = await this.api.post<{ webhook: WhatsAppWebhook }>(`whatsapp/instances/${instanceId}/webhooks`, data);
    return res.data.webhook;
  }

  async fetchDeliveries(instanceId: string, limit: number = 50): Promise<WebhookDelivery[]> {
    const res = await this.api.get<{ deliveries: WebhookDelivery[] }>(
      `whatsapp/webhook/deliveries?instanceId=${instanceId}&limit=${limit}`
    );
    return res.data.deliveries || [];
  }
}
