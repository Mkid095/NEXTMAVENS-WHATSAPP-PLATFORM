/**
 * Instances API - Pure HTTP calls to backend
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppInstance } from '../../types';

export interface CreateInstancePayload {
  name: string;
  webhookUrl?: string;
}

export interface UpdateInstancePayload {
  name?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  rejectCalls?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readReceipts?: boolean;
  readStatus?: boolean;
}

export class InstancesApi {
  private api = getApiService().getAxios();

  async fetchAll(): Promise<WhatsAppInstance[]> {
    const res = await this.api.get<{ instances: WhatsAppInstance[] }>('whatsapp/instances');
    return res.data.instances;
  }

  async create(data: CreateInstancePayload): Promise<WhatsAppInstance> {
    const res = await this.api.post<{ instance: WhatsAppInstance }>('whatsapp/instances', data);
    return res.data.instance;
  }

  async fetchById(id: string): Promise<WhatsAppInstance | null> {
    try {
      const res = await this.api.get<WhatsAppInstance>(`whatsapp/instances/${id}`);
      return res.data;
    } catch {
      return null;
    }
  }

  async update(id: string, data: UpdateInstancePayload): Promise<WhatsAppInstance> {
    const { rejectCalls, groupsIgnore, alwaysOnline, readReceipts, readStatus, ...rest } = data;
    const payload: any = { ...rest };
    const settings: any = {};
    if (rejectCalls !== undefined) settings.rejectCalls = rejectCalls;
    if (groupsIgnore !== undefined) settings.groupsIgnore = groupsIgnore;
    if (alwaysOnline !== undefined) settings.alwaysOnline = alwaysOnline;
    if (readReceipts !== undefined) settings.readReceipts = readReceipts;
    if (readStatus !== undefined) settings.readStatus = readStatus;
    if (Object.keys(settings).length) payload.settings = settings;
    const res = await this.api.put<{ instance: WhatsAppInstance }>(`whatsapp/instances/${id}`, payload);
    return res.data.instance;
  }

  async delete(id: string): Promise<void> {
    await this.api.delete(`whatsapp/instances/${id}`);
  }

  async connect(id: string): Promise<{ qrCode?: string; status?: string }> {
    const res = await this.api.post<{ qrCode?: string; status?: string }>(`whatsapp/instances/${id}/connect`);
    return res.data;
  }

  async disconnect(id: string): Promise<void> {
    await this.api.post<null>(`whatsapp/instances/${id}/disconnect`);
  }
}
