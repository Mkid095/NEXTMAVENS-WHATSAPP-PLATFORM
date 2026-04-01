/**
 * Analytics API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { ApiResponse, AnalyticsResult } from '../../types';

export class AnalyticsApi {
  private api = getApiService().getAxios();

  async fetch(instanceId: string, period: 'day' | 'week' | 'month' = 'week'): Promise<AnalyticsResult> {
    const [convRes, msgRes, agentRes, slaRes] = await Promise.all([
      this.api.get(`whatsapp/analytics/conversations?instanceId=${instanceId}&period=${period}`),
      this.api.get(`whatsapp/analytics/messages?instanceId=${instanceId}&period=${period}`),
      this.api.get(`whatsapp/analytics/agents?instanceId=${instanceId}&period=${period}`),
      this.api.get(`whatsapp/analytics/sla?instanceId=${instanceId}&period=${period}`),
    ]);

    return {
      conversations: convRes.data || null,
      messages: msgRes.data || null,
      agents: agentRes.data || null,
      sla: slaRes.data || null,
    };
  }
}
