/**
 * Groups Service
 *
 * Handles WhatsApp group operations:
 * - List groups
 * - Create/update/delete groups
 * - Manage participants
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppGroup, GroupParticipant } from '../../types';

interface CreateGroupData {
  instanceId: string;
  name: string;
  participants: string[];
}

class GroupsService {
  private api = getApiService().getAxios();

  /**
   * Fetch all groups for an instance
   */
  async fetchByInstance(instanceId: string): Promise<WhatsAppGroup[]> {
    const response = await this.api.get<{ groups: WhatsAppGroup[] }>(`whatsapp/groups?instanceId=${instanceId}`);
    return response.data.groups || [];
  }

  /**
   * Fetch group details by JID
   */
  async fetchByJid(groupJid: string): Promise<WhatsAppGroup | null> {
    try {
      const response = await this.api.get<{ group: WhatsAppGroup }>(`whatsapp/groups/${groupJid}`);
      return response.data.group;
    } catch (error) {
      console.error(`Failed to fetch group ${groupJid}:`, error);
      return null;
    }
  }

  /**
   * Create a new group
   */
  async create(data: CreateGroupData): Promise<WhatsAppGroup> {
    const response = await this.api.post<{ group: WhatsAppGroup }>('whatsapp/groups', data);
    return response.data.group;
  }

  /**
   * Update group details
   */
  async update(groupJid: string, updates: { subject?: string; description?: string; isAnnounceGroup?: boolean }): Promise<void> {
    await this.api.put<null>(`whatsapp/groups/${groupJid}`, updates);
  }

  /**
   * Delete a group
   */
  async delete(groupJid: string): Promise<void> {
    await this.api.delete(`whatsapp/groups/${groupJid}`);
  }

  /**
   * Fetch group participants
   */
  async fetchParticipants(groupJid: string): Promise<GroupParticipant[]> {
    const response = await this.api.get<{ participants: GroupParticipant[] }>(`whatsapp/groups/${groupJid}/participants`);
    return response.data.participants || [];
  }

  /**
   * Add participant to group
   */
  async addParticipant(groupJid: string, phoneNumber: string): Promise<void> {
    await this.api.post<null>(`whatsapp/groups/${groupJid}/participants`, { phoneNumber });
  }

  /**
   * Remove participant from group
   */
  async removeParticipant(groupJid: string, participantJid: string): Promise<void> {
    await this.api.delete(`whatsapp/groups/${groupJid}/participants/${participantJid}`);
  }
}

// Export singleton
const groupsService = new GroupsService();
export { groupsService };
