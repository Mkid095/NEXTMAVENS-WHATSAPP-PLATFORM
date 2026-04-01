/**
 * Messages API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { WhatsAppMessage } from '../../types';

export interface SendMessagePayload {
  chatJid: string;
  message: string;
  type?: 'text';
  mediaUrl?: string;
  quotedMessageId?: string;
}

export interface MarkReadPayload {
  keys: Array<{ remoteJid: string; fromMe: boolean }>;
}

export class MessagesApi {
  private api = getApiService().getAxios();

  async fetchByChat(instanceId: string, chatJid: string): Promise<WhatsAppMessage[]> {
    const res = await this.api.get<{ messages: WhatsAppMessage[] }>(
      `whatsapp/instances/${instanceId}/chats/${chatJid}/messages`
    );
    return res.data.messages || [];
  }

  async send(instanceId: string, payload: SendMessagePayload): Promise<WhatsAppMessage> {
    const { chatJid, message, mediaUrl } = payload;
    const body: any = { number: chatJid, text: message };
    if (mediaUrl) {
      body.media = mediaUrl;
      body.type = payload.type || 'document';
    }
    const res = await this.api.post<{ message: WhatsAppMessage }>(
      `whatsapp/instances/${instanceId}/send`,
      body
    );
    return res.data.message;
  }

  async markRead(instanceId: string, payload: MarkReadPayload): Promise<void> {
    await this.api.post<null>(`whatsapp/instances/${instanceId}/chats/read`, payload);
  }
}
