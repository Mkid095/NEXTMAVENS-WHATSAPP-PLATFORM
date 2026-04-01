/**
 * Settings API - Instance settings
 */

import { getApiService } from '../api/ApiService';
import { ApiResponse, WhatsAppInstance } from '../../types';

export interface UpdateSettingsPayload {
  name?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  rejectCalls?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readReceipts?: boolean;
  readStatus?: boolean;
}

export class SettingsApi {
  private api = getApiService().getAxios();

  async updateInstance(instanceId: string, data: UpdateSettingsPayload): Promise<WhatsAppInstance> {
    const { rejectCalls, groupsIgnore, alwaysOnline, readReceipts, readStatus, ...rest } = data;
    const payload: any = { ...rest };
    const settings: any = {};
    if (rejectCalls !== undefined) settings.rejectCalls = rejectCalls;
    if (groupsIgnore !== undefined) settings.groupsIgnore = groupsIgnore;
    if (alwaysOnline !== undefined) settings.alwaysOnline = alwaysOnline;
    if (readReceipts !== undefined) settings.readReceipts = readReceipts;
    if (readStatus !== undefined) settings.readStatus = readStatus;
    if (Object.keys(settings).length) payload.settings = settings;
    const res = await this.api.put<{ instance: WhatsAppInstance }>(`whatsapp/instances/${instanceId}`, payload);
    return res.data.instance;
  }

  async updateProfileName(instanceId: string, name: string): Promise<void> {
    await this.api.patch<null>(`whatsapp/instances/${instanceId}/profile/name`, { name });
  }

  async updateProfileStatus(instanceId: string, status: string): Promise<void> {
    await this.api.patch<null>(`whatsapp/instances/${instanceId}/profile/status`, { status });
  }
}
