/**
 * Reseller Service
 *
 * Handles reseller API operations for sub-instance management
 */

import { getApiService } from '../api/ApiService';
import { SubInstance, ResellerToken } from '../../types';

interface CreateSubInstanceData {
  parentInstanceId: string;
  name: string;
  clientName?: string;
  clientEmail?: string;
  webhookUrl?: string;
  quotaLimit?: number;
  quotaPeriod?: string;
}

class ResellerService {
  private api = getApiService().getAxios();

  /**
   * Fetch reseller JWT token
   */
  async fetchToken(): Promise<ResellerToken> {
    const response = await this.api.get<ResellerToken>('whatsapp/reseller/token');
    return response.data;
  }

  /**
   * Fetch sub-instances for a parent
   */
  async fetchSubInstances(parentInstanceId: string): Promise<SubInstance[]> {
    const response = await this.api.get<{ subInstances: SubInstance[] }>(
      `whatsapp/reseller/sub-instances?parentId=${parentInstanceId}`
    );
    return response.data.subInstances || [];
  }

  /**
   * Create a new sub-instance
   */
  async createSubInstance(data: CreateSubInstanceData): Promise<SubInstance> {
    const { parentInstanceId, name, clientName, clientEmail, webhookUrl, quotaLimit, quotaPeriod } = data;
    const response = await this.api.post<{ subInstance: SubInstance }>('whatsapp/reseller/create-sub-instance', {
      parentInstanceId,
      name,
      clientName,
      clientEmail,
      webhookUrl,
      quotaLimit,
      quotaPeriod,
    });
    return response.data.subInstance;
  }

  /**
   * Fetch sub-instance status
   */
  async fetchSubInstanceStatus(subInstanceId: string): Promise<SubInstance | null> {
    try {
      const response = await this.api.get<SubInstance>(`whatsapp/reseller/sub-instances/${subInstanceId}/status`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch sub-instance ${subInstanceId}:`, error);
      return null;
    }
  }

  /**
   * Connect sub-instance (generate QR)
   */
  async connectSubInstance(subInstanceId: string): Promise<any> {
    const response = await this.api.post<any>(`whatsapp/reseller/sub-instances/${subInstanceId}/connect`);
    return response.data;
  }

  /**
   * Delete sub-instance
   */
  async deleteSubInstance(subInstanceId: string): Promise<void> {
    await this.api.delete(`whatsapp/reseller/sub-instances/${subInstanceId}`);
  }
}

// Export singleton
const resellerService = new ResellerService();
export { resellerService };
