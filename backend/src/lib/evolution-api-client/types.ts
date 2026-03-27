export interface EvolutionInstance {
  instanceName: string;
  instanceId: string;
  status: 'connecting' | 'open' | 'qrcode' | 'disconnected' | 'error';
  apikey: string;
  webhook?: {
    url: string;
    enabled: boolean;
  };
}

export interface EvolutionMessageStatus {
  id: string;
  chatId: string;
  messageId: string;
  from: string;
  to: string;
  body: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'buttons' | 'template' | 'reaction';
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  quotedMessage?: {
    messageId: string;
    from: string;
    body: string;
  };
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: number;
  followers?: string[];
  mentions?: string[];
  metadata?: Record<string, unknown>;
}

export interface EvolutionSendTextParams {
  instanceId: string;
  to: string;
  content: string;
  quotedMessageId?: string;
  mentions?: string[];
}

export interface EvolutionSendMediaParams {
  instanceId: string;
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  media: string; // base64 or URL
  caption?: string;
  fileName?: string;
  mimetype?: string;
  quotedMessageId?: string;
}

export interface EvolutionSendButtonsParams {
  instanceId: string;
  to: string;
  title: string;
  description?: string;
  footer?: string;
  buttons: Array<{
    id: string;
    text: string;
    type: 'reply' | 'url' | 'call' | 'location';
    value?: string;
  }>;
  quotedMessageId?: string;
}

export interface EvolutionSendLocationParams {
  instanceId: string;
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  quotedMessageId?: string;
}

export interface EvolutionSendTemplateParams {
  instanceId: string;
  to: string;
  templateName: string;
  language: string;
  components?: Array<{
    type: 'header' | 'body' | 'button' | 'footer';
    sub_type?: string;
    index?: number;
    parameters?: Array<{
      type: 'text' | 'currency' | 'date_time' | 'image' | 'video' | 'document' | 'location';
      text?: string;
      currency?: string;
      date_time?: number;
      image?: { link: string };
      video?: { link: string };
      document?: { link: string };
      location?: { latitude: number; longitude: number; name?: string; address?: string };
    }>;
  }>;
}

export interface EvolutionQueueStatus {
  id: string;
  status: string;
  message: string;
  attempt: number;
  timestamp: string;
}

export interface EvolutionWebhookPayload {
  event: string;
  instanceId: string;
  data: EvolutionMessageStatus | Record<string, unknown>;
  timestamp: string;
}
