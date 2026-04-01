/**
 * Instances Service
 *
 * Handles all WhatsApp instance operations:
 * - CRUD operations
 * - Connection management (QR, disconnect)
 * - Real-time status updates via WebSocket
 */

import { getApiService } from '../api/ApiService';
import { webSocketService } from '../websocket/WebSocketService';
import {
  WhatsAppInstance,
  InstanceSettings
} from '../../types';

interface InstanceConnectResponse {
  qrCode?: string;
  status?: string;
}

interface UpdateInstancePayload {
  name?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  rejectCalls?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readReceipts?: boolean;
  readStatus?: boolean;
}

class InstancesService {
  private api = getApiService().getAxios();

  /**
   * Fetch all WhatsApp instances
   */
  async fetchAll(): Promise<WhatsAppInstance[]> {
    const response = await this.api.get<{ instances: WhatsAppInstance[] }>('whatsapp/instances');
    return response.data.instances || [];
  }

  /**
   * Create a new WhatsApp instance
   */
  async create(data: { name: string; webhookUrl?: string }): Promise<WhatsAppInstance> {
    const response = await this.api.post<{ instance: WhatsAppInstance }>('whatsapp/instances', data);
    return response.data.instance;
  }

  /**
   * Fetch single instance by ID
   */
  async fetchById(id: string): Promise<WhatsAppInstance | null> {
    try {
      const response = await this.api.get<WhatsAppInstance>(`whatsapp/instances/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch instance ${id}:`, error);
      return null;
    }
  }

  /**
   * Update instance settings
   */
  async update(id: string, updates: UpdateInstancePayload): Promise<WhatsAppInstance> {
    const { name, webhookUrl, webhookEvents, rejectCalls, groupsIgnore, alwaysOnline, readReceipts, readStatus, ...rest } = updates;

    const payload: any = { ...rest };
    if (name !== undefined) payload.name = name;
    if (webhookUrl !== undefined) payload.webhookUrl = webhookUrl;
    if (webhookEvents !== undefined) payload.webhookEvents = webhookEvents;

    const settings: InstanceSettings = {};
    if (rejectCalls !== undefined) settings.rejectCalls = rejectCalls;
    if (groupsIgnore !== undefined) settings.groupsIgnore = groupsIgnore;
    if (alwaysOnline !== undefined) settings.alwaysOnline = alwaysOnline;
    if (readReceipts !== undefined) settings.readReceipts = readReceipts;
    if (readStatus !== undefined) settings.readStatus = readStatus;

    if (Object.keys(settings).length > 0) {
      payload.settings = settings;
    }

    const response = await this.api.put<{ instance: WhatsAppInstance }>(`whatsapp/instances/${id}`, payload);
    return response.data.instance;
  }

  /**
   * Generate QR code for connection
   */
  async connect(id: string): Promise<InstanceConnectResponse> {
    const response = await this.api.post<InstanceConnectResponse>(`whatsapp/instances/${id}/connect`);
    return response.data;
  }

  /**
   * Disconnect instance
   */
  async disconnect(id: string): Promise<void> {
    await this.api.post<null>(`whatsapp/instances/${id}/disconnect`);
  }

  /**
   * Delete instance
   */
  async delete(id: string): Promise<void> {
    await this.api.delete(`whatsapp/instances/${id}`);
  }

  /**
   * Update profile name
   */
  async updateProfileName(id: string, name: string): Promise<void> {
    await this.api.patch<null>(`whatsapp/instances/${id}/profile/name`, { name });
  }

  /**
   * Update profile status
   */
  async updateProfileStatus(id: string, status: string): Promise<void> {
    await this.api.patch<null>(`whatsapp/instances/${id}/profile/status`, { status });
  }

  /**
   * Subscribe to real-time updates for an instance
   */
  subscribeToInstanceUpdates(instanceId: string): void {
    webSocketService.subscribeToInstance(instanceId);
  }

  /**
   * Unsubscribe from real-time updates for an instance
   */
  unsubscribeFromInstanceUpdates(instanceId: string): void {
    webSocketService.unsubscribeFromInstance(instanceId);
  }

  /**
   * Get WebSocket connection status
   */
  isWebSocketConnected(): boolean {
    return webSocketService.connected;
  }
}

// Export singleton
const instancesService = new InstancesService();
export { instancesService };
