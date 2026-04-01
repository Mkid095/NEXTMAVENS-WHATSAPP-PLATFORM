/**
 * Chats API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppChat } from '../../types';

export class ChatsApi {
  private api = getApiService().getAxios();

  async fetchByInstance(instanceId: string): Promise<WhatsAppChat[]> {
    const res = await this.api.get<{ chats: WhatsAppChat[] }>(`whatsapp/instances/${instanceId}/chats`);
    return res.data.chats || [];
  }
}
