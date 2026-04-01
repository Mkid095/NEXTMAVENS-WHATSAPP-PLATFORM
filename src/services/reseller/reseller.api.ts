/**
 * Reseller API - Pure HTTP calls for sub-instance management
 */

import { getApiService } from '../api/ApiService';
import { SubInstance, ResellerToken } from '../../types';

export interface CreateSubInstanceData {
  parentInstanceId: string;
  name: string;
  clientName?: string;
  clientEmail?: string;
  webhookUrl?: string;
  quotaLimit?: number;
  quotaPeriod?: string;
}

export class ResellerApi {
  private api = getApiService().getAxios();

  async fetchToken(): Promise<ResellerToken> {
    const res = await this.api.get<ResellerToken>('whatsapp/reseller/token');
    return res.data;
  }

  async fetchSubInstances(parentInstanceId: string): Promise<SubInstance[]> {
    const res = await this.api.get<{ subInstances: SubInstance[] }>(
      `whatsapp/reseller/sub-instances?parentId=${parentInstanceId}`
    );
    return res.data.subInstances || [];
  }

  async createSubInstance(data: CreateSubInstanceData): Promise<SubInstance> {
    const { parentInstanceId, name, clientName, clientEmail, webhookUrl, quotaLimit, quotaPeriod } = data;
    const res = await this.api.post<{ subInstance: SubInstance }>('whatsapp/reseller/create-sub-instance', {
      parentInstanceId,
      name,
      clientName,
      clientEmail,
      webhookUrl,
      quotaLimit,
      quotaPeriod,
    });
    return res.data.subInstance;
  }

  async fetchSubInstanceStatus(subInstanceId: string): Promise<SubInstance | null> {
    try {
      const res = await this.api.get<SubInstance>(`whatsapp/reseller/sub-instances/${subInstanceId}/status`);
      return res.data;
    } catch {
      return null;
    }
  }

  async connectSubInstance(subInstanceId: string): Promise<any> {
    const res = await this.api.post<any>(`whatsapp/reseller/sub-instances/${subInstanceId}/connect`);
    return res.data;
  }

  async deleteSubInstance(subInstanceId: string): Promise<void> {
    await this.api.delete(`whatsapp/reseller/sub-instances/${subInstanceId}`);
  }
}
