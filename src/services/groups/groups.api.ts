/**
 * Groups API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppGroup, GroupParticipant } from '../../types';

export interface CreateGroupData {
  instanceId: string;
  name: string;
  participants: string[];
}

export class GroupsApi {
  private api = getApiService().getAxios();

  async fetchByInstance(instanceId: string): Promise<WhatsAppGroup[]> {
    const res = await this.api.get<{ groups: WhatsAppGroup[] }>(`whatsapp/groups?instanceId=${instanceId}`);
    return res.data.groups || [];
  }

  async fetchByJid(groupJid: string): Promise<WhatsAppGroup | null> {
    try {
      const res = await this.api.get<{ group: WhatsAppGroup }>(`whatsapp/groups/${groupJid}`);
      return res.data.group;
    } catch {
      return null;
    }
  }

  async create(data: CreateGroupData): Promise<WhatsAppGroup> {
    const res = await this.api.post<{ group: WhatsAppGroup }>('whatsapp/groups', data);
    return res.data.group;
  }

  async update(groupJid: string, updates: { subject?: string; description?: string; isAnnounceGroup?: boolean }): Promise<void> {
    await this.api.put<null>(`whatsapp/groups/${groupJid}`, updates);
  }

  async delete(groupJid: string): Promise<void> {
    await this.api.delete(`whatsapp/groups/${groupJid}`);
  }

  async fetchParticipants(groupJid: string): Promise<GroupParticipant[]> {
    const res = await this.api.get<{ participants: GroupParticipant[] }>(`whatsapp/groups/${groupJid}/participants`);
    return res.data.participants || [];
  }

  async addParticipant(groupJid: string, phoneNumber: string): Promise<void> {
    await this.api.post<null>(`whatsapp/groups/${groupJid}/participants`, { phoneNumber });
  }

  async removeParticipant(groupJid: string, participantJid: string): Promise<void> {
    await this.api.delete(`whatsapp/groups/${groupJid}/participants/${participantJid}`);
  }
}
