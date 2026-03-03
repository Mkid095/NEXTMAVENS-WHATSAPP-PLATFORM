import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface WhatsAppInstance {
  id: string;
  orgId: string;
  name: string;
  evolutionInstanceId?: string;
  evolutionApiKey?: string; // Public API key for this instance
  phoneNumber?: string;
  profileName?: string;
  profilePicture?: string;
  pushName?: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'QR_READY' | 'CONNECTING' | 'CREATING' | 'FAILED';
  battery?: number;
  isOnline?: boolean;
  isBusiness?: boolean;
  connectedAt?: string;
  qrCode?: string;
  pairingCode?: string;
  qrExpiresAt?: string;
  settings?: {
    rejectCalls?: boolean;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readReceipts?: boolean;
    readStatus?: boolean;
  };
  typebotEnabled?: boolean;
  typebotConfig?: any;
  chatwootEnabled?: boolean;
  chatwootConfig?: any;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEvents?: string[];
  messagesSent?: number;
  messagesReceived?: number;
  apiCalls?: number;
  lastActivityAt?: string;
  // Reseller / Sub-instance
  parentInstanceId?: string;
  isSubInstance?: boolean;
  clientName?: string;
  clientEmail?: string;
  clientMetadata?: any;
  // Quota
  quotaLimit?: number;
  quotaPeriod?: string;
  quotaUsed?: number;
  quotaResetAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export function useInstances() {
  return useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/instances');
      return (data.instances || []) as WhatsAppInstance[];
    },
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceData: { name: string; webhookUrl?: string }) => {
      const { data } = await api.post('/whatsapp/instances', instanceData);
      return data.instance || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

export function useQRCode(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/whatsapp/instances/${instanceId}/connect`);
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-qr', instanceId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

export function useCachedQR(instanceId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['whatsapp-instance-qr', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/qr`);
      return data || null;
    },
    refetchInterval: 2000,
    enabled,
  });
}

export function useInstanceStatus(instanceId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['whatsapp-instance-status', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/status`);
      return data || null;
    },
    refetchInterval: 5000,
    enabled,
  });
}

export function useDisconnectInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data } = await api.post(`/whatsapp/instances/${instanceId}/disconnect`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

export interface WhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  profilePicUrl?: string;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe: boolean;
  mediaUrl?: string;
}

export function useChats(instanceId: string | null) {
  return useQuery({
    queryKey: ['whatsapp-chats', instanceId],
    queryFn: async () => {
      if (!instanceId) return [];
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/chats`);
      return (data.chats || []) as WhatsAppChat[];
    },
    enabled: !!instanceId,
  });
}

export function useChatMessages(instanceId: string | null, chatJid: string | null) {
  return useQuery({
    queryKey: ['whatsapp-messages', instanceId, chatJid],
    queryFn: async () => {
      if (!instanceId || !chatJid) return [];
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/chats/${chatJid}/messages`);
      return (data.messages || []) as WhatsAppMessage[];
    },
    enabled: !!instanceId && !!chatJid,
    refetchInterval: 5000, // Poll for new messages
  });
}

export function useMarkRead(instanceId: string) {
  return useMutation({
    mutationFn: async (chatJid: string) => {
      const { data } = await api.post(`/whatsapp/instances/${instanceId}/chats/read`, {
        keys: [{ remoteJid: chatJid, fromMe: false }]
      });
      return data || null;
    },
  });
}

export interface WhatsAppWebhook {
  id: string;
  url: string;
  enabled: boolean;
  byEvents: boolean;
  base64: boolean;
  events: string[];
}

export function useWebhooks(instanceId: string | null) {
  return useQuery({
    queryKey: ['whatsapp-webhooks', instanceId],
    queryFn: async () => {
      if (!instanceId) return [];
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/webhooks`);
      return (data.webhooks || []) as WhatsAppWebhook[];
    },
    enabled: !!instanceId,
  });
}

export function useUpdateWebhook(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (webhookData: Partial<WhatsAppWebhook>) => {
      const { data } = await api.post(`/whatsapp/instances/${instanceId}/webhooks`, webhookData);
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-webhooks', instanceId] });
    },
  });
}

export function useUpdateProfile(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profileData: { name?: string; status?: string }) => {
      if (profileData.name) {
        await api.patch(`/whatsapp/instances/${instanceId}/profile/name`, { name: profileData.name });
      }
      if (profileData.status) {
        await api.patch(`/whatsapp/instances/${instanceId}/profile/status`, { status: profileData.status });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-status', instanceId] });
    },
  });
}

export function useUpdateSettings(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: { rejectCalls?: boolean; groupsIgnore?: boolean; alwaysOnline?: boolean }) => {
      const { data } = await api.put(`/whatsapp/instances/${instanceId}`, { ...settings });
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-status', instanceId] });
    },
  });
}

export interface WhatsAppApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
}

export function useApiKeys(instanceId: string) {
  return useQuery({
    queryKey: ['whatsapp-api-keys', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/keys`);
      return (data.keys || []) as WhatsAppApiKey[];
    },
    enabled: !!instanceId,
  });
}

export function useCreateApiKey(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyData: { name: string }) => {
      const { data } = await api.post(`/whatsapp/instances/${instanceId}/keys`, keyData);
      return data.key || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-api-keys', instanceId] });
    },
  });
}

export function useDeleteApiKey(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      await api.delete(`/whatsapp/instances/${instanceId}/keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-api-keys', instanceId] });
    },
  });
}

export function useSendMessage(instanceId: string) {
  return useMutation({
    mutationFn: async ({ number, text }: { number: string; text: string }) => {
      const { data } = await api.post(`/whatsapp/instances/${instanceId}/send`, { number, text });
      return data;
    },
  });
}
