import axios from 'axios';
import { EvolutionApiClient, EvolutionAuthenticationError, EvolutionRateLimitError, EvolutionApiError } from '../../../lib/evolution-api-client';

// Mock axios module entirely
jest.mock('axios');

const createMockHttp = () => ({
  interceptors: {
    response: {
      use: jest.fn(),
    },
  },
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
});

describe('EvolutionApiClient', () => {
  let client: EvolutionApiClient;
  let mockHttp: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHttp = createMockHttp();
    (axios.create as jest.Mock) = jest.fn(() => mockHttp);
    client = new EvolutionApiClient({
      baseUrl: 'http://localhost:3001',
      apiKey: 'test-key',
    });
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(client.baseUrl).toBe('http://localhost:3001');
      expect(client.apiKey).toBe('test-key');
      expect(client.timeout).toBe(30000);
    });

    it('should create axios instance with correct headers', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:3001',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'test-key',
        },
      });
    });
  });

  describe('getInstance', () => {
    it('should fetch instance by name', async () => {
      const mockResponse = {
        data: {
          instanceName: 'test',
          instanceId: '123',
          status: 'open',
          apikey: 'key',
        },
      };
      (mockHttp.get as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.getInstance('test');

      expect(mockHttp.get).toHaveBeenCalledWith('/instance/fetchInstances/test');
      expect(result).toEqual(mockResponse.data);
    });

    it('should wrap unknown errors in EvolutionApiError', async () => {
      (mockHttp.get as jest.Mock).mockRejectedValueOnce({
        response: { status: 404, data: { message: 'Not found' } },
      });

      await expect(client.getInstance('test')).rejects.toThrow(EvolutionApiError);
    });
  });

  describe('listInstances', () => {
    it('should fetch all instances', async () => {
      const mockResponse = {
        data: [
          { instanceName: 'test1', instanceId: '1', status: 'open', apikey: 'key' },
          { instanceName: 'test2', instanceId: '2', status: 'open', apikey: 'key' },
        ],
      };
      (mockHttp.get as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.listInstances();

      expect(mockHttp.get).toHaveBeenCalledWith('/instance/fetchInstances');
      expect(result).toHaveLength(2);
    });
  });

  describe('createInstance', () => {
    it('should create a new instance', async () => {
      const mockResponse = {
        data: { instanceName: 'new-instance', instanceId: '456', status: 'connecting', apikey: 'new-key' },
      };
      (mockHttp.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.createInstance('new-instance');

      expect(mockHttp.post).toHaveBeenCalledWith('/instance/create', { instanceName: 'new-instance' });
      expect(result.instanceName).toBe('new-instance');
    });
  });

  describe('sendText', () => {
    it('should send text message', async () => {
      const mockResponse = { data: { messageId: 'msg-123' } };
      (mockHttp.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.sendText({
        instanceId: '123',
        to: '+1234567890',
        content: 'Hello world',
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendText/123', {
        number: '+1234567890',
        content: 'Hello world',
      });
      expect(result.messageId).toBe('msg-123');
    });

    it('should send with mentions', async () => {
      (mockHttp.post as jest.Mock).mockResolvedValueOnce({ data: { messageId: 'msg-456' } });

      await client.sendText({
        instanceId: '123',
        to: '+1234567890',
        content: 'Hello @user',
        mentions: ['@user'],
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendText/123', {
        number: '+1234567890',
        content: 'Hello @user',
        mentions: ['@user'],
      });
    });
  });

  describe('sendMedia', () => {
    it('should send image', async () => {
      (mockHttp.post as jest.Mock).mockResolvedValueOnce({ data: { messageId: 'img-123' } });

      const result = await client.sendMedia({
        instanceId: '123',
        to: '+1234567890',
        mediaType: 'image',
        media: 'base64data==',
        caption: 'Check this out',
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendImage/123', {
        number: '+1234567890',
        media: 'base64data==',
        caption: 'Check this out',
      });
      expect(result.messageId).toBe('img-123');
    });

    it('should send document', async () => {
      (mockHttp.post as jest.Mock).mockResolvedValueOnce({ data: { messageId: 'doc-123' } });

      await client.sendMedia({
        instanceId: '123',
        to: '+1234567890',
        mediaType: 'document',
        media: 'http://example.com/file.pdf',
        fileName: 'file.pdf',
        mimetype: 'application/pdf',
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendDocument/123', {
        number: '+1234567890',
        media: 'http://example.com/file.pdf',
        fileName: 'file.pdf',
        mimetype: 'application/pdf',
      });
    });
  });

  describe('sendButtons', () => {
    it('should send buttons message', async () => {
      (mockHttp.post as jest.Mock).mockResolvedValueOnce({ data: { messageId: 'btn-123' } });

      const buttons = [
        { id: '1', text: 'Yes', type: 'reply', value: 'yes' },
        { id: '2', text: 'No', type: 'reply', value: 'no' },
      ];

      const result = await client.sendButtons({
        instanceId: '123',
        to: '+1234567890',
        title: 'Confirm?',
        description: 'Please confirm',
        footer: 'Optional footer',
        buttons,
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendButtons/123', {
        number: '+1234567890',
        title: 'Confirm?',
        description: 'Please confirm',
        footer: 'Optional footer',
        buttons,
      });
      expect(result.messageId).toBe('btn-123');
    });
  });

  describe('sendLocation', () => {
    it('should send location', async () => {
      (mockHttp.post as jest.Mock).mockResolvedValueOnce({ data: { messageId: 'loc-123' } });

      const result = await client.sendLocation({
        instanceId: '123',
        to: '+1234567890',
        latitude: 37.7749,
        longitude: -122.4194,
        name: 'San Francisco',
        address: 'CA, USA',
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendLocation/123', {
        number: '+1234567890',
        latitude: 37.7749,
        longitude: -122.4194,
        name: 'San Francisco',
        address: 'CA, USA',
      });
      expect(result.messageId).toBe('loc-123');
    });
  });

  describe('sendTemplate', () => {
    it('should send template', async () => {
      (mockHttp.post as jest.Mock).mockResolvedValueOnce({ data: { messageId: 'tpl-123' } });

      const result = await client.sendTemplate({
        instanceId: '123',
        to: '+1234567890',
        templateName: 'welcome',
        language: 'en',
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'John' }],
          },
        ],
      });

      expect(mockHttp.post).toHaveBeenCalledWith('/message/sendTemplate/123', {
        number: '+1234567890',
        template: {
          name: 'welcome',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: 'John' }],
            },
          ],
        },
      });
      expect(result.messageId).toBe('tpl-123');
    });
  });

  describe('getQueueStatus', () => {
    it('should fetch queue messages', async () => {
      const mockResponse = {
        data: [
          { id: '1', status: 'pending', message: 'queued', timestamp: '2025-01-01T00:00:00Z' },
        ],
      };
      (mockHttp.get as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.getQueueStatus('123');

      expect(mockHttp.get).toHaveBeenCalledWith('/message/getQueueMessages/123');
      expect(result).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw EvolutionAuthenticationError on 401', async () => {
      (mockHttp.get as jest.Mock).mockRejectedValueOnce(new EvolutionAuthenticationError('Invalid API key'));

      await expect(client.getInstance('test')).rejects.toThrow(EvolutionAuthenticationError);
    });

    it('should throw EvolutionRateLimitError on 429', async () => {
      (mockHttp.get as jest.Mock).mockRejectedValueOnce(new EvolutionRateLimitError('Rate limited', 60));

      const error = await client.getInstance('test').catch(e => e);
      expect(error instanceof EvolutionRateLimitError).toBe(true);
    });
  });
});
