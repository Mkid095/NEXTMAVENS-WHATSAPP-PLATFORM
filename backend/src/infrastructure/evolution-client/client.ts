import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  EvolutionInstance,
  EvolutionSendTextParams,
  EvolutionSendMediaParams,
  EvolutionSendButtonsParams,
  EvolutionSendLocationParams,
  EvolutionSendTemplateParams,
  EvolutionQueueStatus,
  EvolutionWebhookPayload,
  EvolutionMessageStatus,
} from './types';
import {
  EvolutionApiError,
  EvolutionAuthenticationError,
  EvolutionRateLimitError,
  EvolutionNotFoundError,
  EvolutionInstanceUnavailableError,
} from './errors';

export interface EvolutionClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class EvolutionApiClient {
  public readonly baseUrl: string;
  public readonly apiKey: string;
  public readonly timeout: number;
  private readonly http: AxiosInstance;

  constructor(config: EvolutionClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          const message = data?.message || data?.error || 'Evolution API error';

          switch (status) {
            case 401:
              return Promise.reject(new EvolutionAuthenticationError(message));
            case 403:
              return Promise.reject(new EvolutionAuthenticationError('Forbidden: Insufficient permissions'));
            case 404:
              return Promise.reject(new EvolutionNotFoundError('resource', 'unknown'));
            case 429:
              const retryAfter = data?.retryAfter || error.headers?.['retry-after'];
              return Promise.reject(new EvolutionRateLimitError(message, retryAfter));
            default:
              return Promise.reject(new EvolutionApiError(message, status, data));
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async request<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    try {
      const args: any[] = [url];
      if (data !== undefined) args.push(data);
      if (config !== undefined) args.push(config);
      // @ts-ignore - axios methods accept variable argument lists
      const response: AxiosResponse<T> = await (this.http[method] as any)(...args);
      return response.data;
    } catch (error: unknown) {
      if (error instanceof EvolutionApiError) {
        throw error;
      }
      throw new EvolutionApiError(`Request failed: ${method} ${url}`, 0, error);
    }
  }

  async getInstance(instanceName: string): Promise<EvolutionInstance> {
    return this.request<EvolutionInstance>('get', `/instance/fetchInstances/${instanceName}`);
  }

  async listInstances(): Promise<EvolutionInstance[]> {
    return this.request<EvolutionInstance[]>('get', '/instance/fetchInstances');
  }

  async createInstance(instanceName: string): Promise<EvolutionInstance> {
    return this.request<EvolutionInstance>('post', '/instance/create', { instanceName });
  }

  async deleteInstance(instanceName: string): Promise<void> {
    return this.request<void>('delete', `/instance/delete/${instanceName}`);
  }

  async restartInstance(instanceName: string): Promise<void> {
    return this.request<void>('post', `/instance/restart/${instanceName}`);
  }

  async logoutInstance(instanceName: string): Promise<void> {
    return this.request<void>('post', `/instance/logout/${instanceName}`);
  }

  async getQRCode(instanceName: string): Promise<{ base64: string }> {
    return this.request<{ base64: string }>('get', `/instance/qrcode/${instanceName}`);
  }

  async connect(instanceName: string): Promise<{ base64: string }> {
    return this.request<{ base64: string }>('get', `/instance/connect/${instanceName}`);
  }

  async setWebhook(instanceName: string, webhookUrl: string, enabled: boolean = true): Promise<void> {
    return this.request<void>('post', `/webhook/set/${instanceName}`, {
      url: webhookUrl,
      enabled,
    });
  }

  async sendText(params: EvolutionSendTextParams): Promise<{ messageId: string }> {
    const { instanceId, to, content, quotedMessageId, mentions } = params;
    return this.request<{ messageId: string }>('post', `/message/sendText/${instanceId}`, {
      textMessage: content,
      number: to,
      ...(quotedMessageId && { quotedMessageId }),
      ...(mentions && { mentions }),
    });
  }

  async sendMedia(params: EvolutionSendMediaParams): Promise<{ messageId: string }> {
    const { instanceId, to, mediaType, ...rest } = params;
    return this.request<{ messageId: string }>('post', `/message/send${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}/${instanceId}`, {
      ...rest,
      number: to,
    });
  }

  async sendButtons(params: EvolutionSendButtonsParams): Promise<{ messageId: string }> {
    const { instanceId, to, title, buttons, ...rest } = params;
    return this.request<{ messageId: string }>('post', `/message/sendButtons/${instanceId}`, {
      title,
      buttons,
      number: to,
      ...rest,
    });
  }

  async sendLocation(params: EvolutionSendLocationParams): Promise<{ messageId: string }> {
    const { instanceId, to, latitude, longitude, ...rest } = params;
    return this.request<{ messageId: string }>('post', `/message/sendLocation/${instanceId}`, {
      latitude,
      longitude,
      number: to,
      ...rest,
    });
  }

  async sendTemplate(params: EvolutionSendTemplateParams): Promise<{ messageId: string }> {
    const { instanceId, to, templateName, language, components } = params;
    return this.request<{ messageId: string }>('post', `/message/sendTemplate/${instanceId}`, {
      template: {
        name: templateName,
        language: { code: language },
        ...(components && { components }),
      },
      number: to,
    });
  }

  async getQueueStatus(instanceId: string): Promise<EvolutionQueueStatus[]> {
    return this.request<EvolutionQueueStatus[]>('get', `/message/getQueueMessages/${instanceId}`);
  }

  async fetchMessage(messageId: string): Promise<EvolutionMessageStatus> {
    return this.request<EvolutionMessageStatus>('get', `/message/findMessage/${messageId}`);
  }

  async deleteMessage(instanceId: string, messageId: string): Promise<void> {
    return this.request<void>('delete', `/message/delete/${instanceId}/${messageId}`);
  }

  async fetchChats(instanceId: string, sort?: string, limit?: number): Promise<EvolutionMessageStatus[]> {
    const params = new URLSearchParams();
    if (sort) params.append('sort', sort);
    if (limit) params.append('limit', limit.toString());
    return this.request<EvolutionMessageStatus[]>('get', `/chat/fetchChats/${instanceId}?${params.toString()}`);
  }

  async fetchChatMessages(
    instanceId: string,
    chatId: string,
    sort?: string,
    limit?: number
  ): Promise<EvolutionMessageStatus[]> {
    const params = new URLSearchParams();
    if (sort) params.append('sort', sort);
    if (limit) params.append('limit', limit.toString());
    return this.request<EvolutionMessageStatus[]>('get', `/chat/fetchMessages/${instanceId}/${chatId}?${params.toString()}`);
  }

  async markChatAsRead(instanceId: string, chatId: string, lastMessageId: string): Promise<void> {
    return this.request<void>('post', `/chat/markChatAsRead/${instanceId}`, {
      id: chatId,
      lastMessageId,
    });
  }
}

export function createEvolutionClient(config: EvolutionClientConfig): EvolutionApiClient {
  return new EvolutionApiClient(config);
}
