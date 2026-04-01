/**
 * Templates API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { MessageTemplate } from '../../types';

export interface CreateTemplateData {
  instanceId: string;
  name: string;
  category: 'marketing' | 'transactional' | 'utility';
  language: string;
  components: any[];
}

export class TemplatesApi {
  private api = getApiService().getAxios();

  async fetchByInstance(instanceId: string): Promise<MessageTemplate[]> {
    const res = await this.api.get<{ templates: MessageTemplate[] }>(`whatsapp/templates?instanceId=${instanceId}`);
    return res.data.templates || [];
  }

  async create(data: CreateTemplateData): Promise<MessageTemplate> {
    const res = await this.api.post<{ template: MessageTemplate }>('whatsapp/templates', data);
    return res.data.template;
  }

  async update(templateId: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate> {
    const res = await this.api.put<{ template: MessageTemplate }>(`whatsapp/templates/${templateId}`, updates);
    return res.data.template;
  }

  async delete(templateId: string): Promise<void> {
    await this.api.delete(`whatsapp/templates/${templateId}`);
  }

  async render(templateId: string, variables: Record<string, string>): Promise<any> {
    const res = await this.api.post<any>(`whatsapp/templates/${templateId}/render`, { variables });
    return res.data;
  }
}
