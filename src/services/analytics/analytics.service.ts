/**
 * Analytics Service
 *
 * Handles analytics data retrieval
 */

import { getApiService } from '../api/ApiService';
import { AnalyticsResult } from '../../types';

class AnalyticsService {
  private api = getApiService().getAxios();

  /**
   * Fetch analytics for an instance
   */
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

// Export singleton
const analyticsService = new AnalyticsService();
export { analyticsService };
