/**
 * Agents API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppAgent, ChatAssignment } from '../../types';

export class AgentsApi {
  private api = getApiService().getAxios();

  async fetchByInstance(instanceId: string): Promise<WhatsAppAgent[]> {
    const res = await this.api.get<{ agents: WhatsAppAgent[] }>(`whatsapp/instances/${instanceId}/agents`);
    return res.data.agents || [];
  }

  async create(instanceId: string, name: string, avatar?: string): Promise<WhatsAppAgent> {
    const res = await this.api.post<{ agent: WhatsAppAgent }>(`whatsapp/instances/${instanceId}/agents`, { name, avatar });
    return res.data.agent;
  }

  async updateStatus(agentId: string, status: 'available' | 'busy' | 'away' | 'offline'): Promise<void> {
    await this.api.put<null>(`whatsapp/agents/${agentId}/status`, { status });
  }

  async fetchQueue(instanceId: string): Promise<any[]> {
    const res = await this.api.get<{ queue: any[] }>(`whatsapp/instances/${instanceId}/queue`);
    return res.data.queue || [];
  }

  async fetchAssignments(instanceId: string): Promise<ChatAssignment[]> {
    const res = await this.api.get<{ assignments: ChatAssignment[] }>(`whatsapp/assignments/${instanceId}`);
    return res.data.assignments || [];
  }

  async assignChat(chatJid: string, agentId: string): Promise<void> {
    await this.api.post<null>('whatsapp/assignments', { chatJid, agentId });
  }
}
