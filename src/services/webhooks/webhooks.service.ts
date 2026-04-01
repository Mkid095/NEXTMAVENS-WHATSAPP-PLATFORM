/**
 * Webhooks Service
 *
 * Handles webhook configuration and delivery tracking
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppWebhook, WebhookDelivery } from '../../types';

interface UpsertWebhookData {
  url: string;
  enabled?: boolean;
  byEvents?: boolean;
  base64?: boolean;
  events?: string[];
}

class WebhooksService {
  private api = getApiService().getAxios();

  /**
   * Fetch webhooks for an instance
   */
  async fetchByInstance(instanceId: string): Promise<WhatsAppWebhook[]> {
    const response = await this.api.get<{ webhooks: WhatsAppWebhook[] }>(`whatsapp/instances/${instanceId}/webhooks`);
    return response.data.webhooks || [];
  }

  /**
   * Create or update webhook configuration
   */
  async upsert(instanceId: string, data: UpsertWebhookData): Promise<WhatsAppWebhook> {
    const response = await this.api.post<{ webhook: WhatsAppWebhook }>(`whatsapp/instances/${instanceId}/webhooks`, data);
    return response.data.webhook;
  }

  /**
   * Fetch webhook delivery history
   */
  async fetchDeliveries(instanceId: string, limit: number = 50): Promise<WebhookDelivery[]> {
    const response = await this.api.get<{ deliveries: WebhookDelivery[] }>(
      `whatsapp/webhook/deliveries?instanceId=${instanceId}&limit=${limit}`
    );
    return response.data.deliveries || [];
  }
}

// Export singleton
const webhooksService = new WebhooksService();
export { webhooksService };
