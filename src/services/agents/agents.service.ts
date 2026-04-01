/**
 * Agents Service
 *
 * Handles agent management and queue operations:
 * - List agents
 * - Create/update agents
 * - Chat assignments
 * - Queue management
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppAgent, ChatAssignment } from '../../types';

interface CreateAgentData {
  instanceId: string;
  name: string;
  avatar?: string;
}

class AgentsService {
  private api = getApiService().getAxios();

  /**
   * Fetch agents for an instance
   */
  async fetchByInstance(instanceId: string): Promise<WhatsAppAgent[]> {
    const response = await this.api.get<{ agents: WhatsAppAgent[] }>(`whatsapp/instances/${instanceId}/agents`);
    return response.data.agents || [];
  }

  /**
   * Create a new agent
   */
  async create(data: CreateAgentData): Promise<WhatsAppAgent> {
    const response = await this.api.post<{ agent: WhatsAppAgent }>(`whatsapp/instances/${data.instanceId}/agents`, {
      name: data.name,
      avatar: data.avatar,
    });
    return response.data.agent;
  }

  /**
   * Update agent status
   */
  async updateStatus(agentId: string, status: 'available' | 'busy' | 'away' | 'offline'): Promise<void> {
    await this.api.put<null>(`whatsapp/agents/${agentId}/status`, { status });
  }

  /**
   * Fetch queue for an instance
   */
  async fetchQueue(instanceId: string): Promise<any[]> {
    const response = await this.api.get<{ queue: any[] }>(`whatsapp/instances/${instanceId}/queue`);
    return response.data.queue || [];
  }

  /**
   * Fetch assignments for an instance
   */
  async fetchAssignments(instanceId: string): Promise<ChatAssignment[]> {
    const response = await this.api.get<{ assignments: ChatAssignment[] }>(`whatsapp/assignments/${instanceId}`);
    return response.data.assignments || [];
  }

  /**
   * Assign chat to agent
   */
  async assignChat(chatJid: string, agentId: string): Promise<void> {
    await this.api.post<null>('whatsapp/assignments', { chatJid, agentId });
  }
}

// Export singleton
const agentsService = new AgentsService();
export { agentsService };
