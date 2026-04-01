/**
 * Templates Service
 *
 * Handles WhatsApp message template operations:
 * - List templates
 * - Create/update/delete templates
 * - Render templates with variables
 */

import { getApiService } from '../api/ApiService';
import { MessageTemplate } from '../../types';

interface CreateTemplateData {
  instanceId: string;
  name: string;
  category: 'marketing' | 'transactional' | 'utility';
  language: string;
  components: any[];
}

class TemplatesService {
  private api = getApiService().getAxios();

  /**
   * Fetch templates for an instance
   */
  async fetchByInstance(instanceId: string): Promise<MessageTemplate[]> {
    const response = await this.api.get<{ templates: MessageTemplate[] }>(`whatsapp/templates?instanceId=${instanceId}`);
    return response.data.templates || [];
  }

  /**
   * Create a new template
   */
  async create(data: CreateTemplateData): Promise<MessageTemplate> {
    const response = await this.api.post<{ template: MessageTemplate }>('whatsapp/templates', data);
    return response.data.template;
  }

  /**
   * Update a template
   */
  async update(templateId: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate> {
    const response = await this.api.put<{ template: MessageTemplate }>(`whatsapp/templates/${templateId}`, updates);
    return response.data.template;
  }

  /**
   * Delete a template
   */
  async delete(templateId: string): Promise<void> {
    await this.api.delete(`whatsapp/templates/${templateId}`);
  }

  /**
   * Render a template with variables
   */
  async render(templateId: string, variables: Record<string, string>): Promise<any> {
    const response = await this.api.post<any>(`whatsapp/templates/${templateId}/render`, { variables });
    return response.data;
  }
}

// Export singleton
const templatesService = new TemplatesService();
export { templatesService };
