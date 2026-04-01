/**
 * Template Types
 * Types for WhatsApp message templates
 */

export interface MessageTemplate {
  id: string;
  instanceId: string;
  name: string;
  category: 'marketing' | 'transactional' | 'utility';
  language: string;
  status: 'approved' | 'pending' | 'rejected';
  components: TemplateComponent[];
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  text?: string;
  mediaUrl?: string;
  format?: 'text' | 'image' | 'document' | 'video';
  buttons?: TemplateButton[];
}

export interface TemplateButton {
  type: 'url' | 'phone' | 'reply';
  text: string;
  value?: string;
}
