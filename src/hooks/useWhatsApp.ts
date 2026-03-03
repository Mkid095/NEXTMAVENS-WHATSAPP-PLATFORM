import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

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
      toast.success('WhatsApp instance created successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create instance');
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
      toast.success('QR code generated! Scan it with your WhatsApp.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate QR');
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
      toast.success('Instance disconnected');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to disconnect');
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
      toast.success('Profile updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update profile');
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
      toast.success('API key created');
    },
    onError: () => {
      toast.error('Failed to create API key');
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
      toast.success('API key deleted');
    },
    onError: () => {
      toast.error('Failed to delete API key');
    },
  });
}

// ==========================================
// SUB-INSTANCES (Reseller)
// ==========================================

export interface SubInstance extends Omit<WhatsAppInstance, 'isSubInstance' | 'parentInstanceId'> {
  isSubInstance: true;
  parentInstanceId: string;
  clientName?: string;
  clientEmail?: string;
  quotaLimit?: number;
  quotaUsed: number;
  quotaPeriod?: string;
}

export function useSubInstances(parentInstanceId: string) {
  return useQuery({
    queryKey: ['sub-instances', parentInstanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/reseller/sub-instances?parentId=${parentInstanceId}`);
      return (data.subInstances || []) as SubInstance[];
    },
    enabled: !!parentInstanceId,
  });
}

export function useCreateSubInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      parentInstanceId: string;
      name: string;
      clientName?: string;
      clientEmail?: string;
      webhookUrl?: string;
      quotaLimit?: number;
      quotaPeriod?: string;
    }) => {
      const { data: response } = await api.post('/whatsapp/reseller/create-sub-instance', data);
      return response.subInstance || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

export function useSubInstanceStatus(subInstanceId: string) {
  return useQuery({
    queryKey: ['sub-instance-status', subInstanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/reseller/sub-instances/${subInstanceId}/status`);
      return data || null;
    },
    enabled: !!subInstanceId,
  });
}

export function useConnectSubInstance(subInstanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/whatsapp/reseller/sub-instances/${subInstanceId}/connect`);
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-instance-status', subInstanceId] });
      queryClient.invalidateQueries({ queryKey: ['sub-instances'] });
    },
  });
}

export function useDeleteSubInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subInstanceId: string) => {
      await api.delete(`/whatsapp/reseller/sub-instances/${subInstanceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

// ==========================================
// TEAM / AGENTS
// ==========================================

export interface WhatsAppAgent {
  id: string;
  instanceId: string;
  name: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  avatar?: string;
  createdAt: string;
}

export function useAgents(instanceId: string) {
  return useQuery({
    queryKey: ['agents', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/agents`);
      return (data.agents || []) as WhatsAppAgent[];
    },
    enabled: !!instanceId,
  });
}

export function useCreateAgent(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; avatar?: string }) => {
      const { data: response } = await api.post(`/whatsapp/instances/${instanceId}/agents`, data);
      return response.agent || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', instanceId] });
      toast.success('Agent created');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create agent');
    },
  });
}

export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, status }: { agentId: string; status: 'available' | 'busy' | 'away' | 'offline' }) => {
      const { data } = await api.put(`/whatsapp/agents/${agentId}/status`, { status });
      return data || null;
    },
    onSuccess: () => {
      toast.success('Agent status updated');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update agent status');
    },
  });
}

export interface ChatAssignment {
  id: string;
  chatJid: string;
  agentId: string;
  assignedAt: string;
}

export function useQueue(instanceId: string) {
  return useQuery({
    queryKey: ['queue', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/queue`);
      return (data.queue || []) as any[];
    },
    enabled: !!instanceId,
    refetchInterval: 5000,
  });
}

export function useAssignments(instanceId: string) {
  return useQuery({
    queryKey: ['assignments', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/assignments/${instanceId}`);
      return (data.assignments || []) as ChatAssignment[];
    },
    enabled: !!instanceId,
  });
}

export function useAssignChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatJid, agentId }: { chatJid: string; agentId: string }) => {
      const { data } = await api.post('/whatsapp/assignments', { chatJid, agentId });
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Chat assigned to agent');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to assign chat');
    },
  });
}

// ==========================================
// GROUPS
// ==========================================

export interface WhatsAppGroup {
  id: string; // JID
  instanceId: string;
  name: string;
  subject: string;
  subjectTime: number;
  description?: string;
  ownerJid: string;
  participantsCount: number;
  creation: number;
  isReadOnly?: boolean;
  isAnnounceGroup?: boolean;
  createdAt: string;
}

export interface GroupParticipant {
  id: string;
  jid: string;
  name: string;
  isAdmin: boolean;
  isContact?: boolean;
  pushName?: string;
}

export function useGroups(instanceId: string) {
  return useQuery({
    queryKey: ['groups', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/groups?instanceId=${instanceId}`);
      return (data.groups || []) as WhatsAppGroup[];
    },
    enabled: !!instanceId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { instanceId: string; name: string; participants: string[] }) => {
      const { data: response } = await api.post('/whatsapp/groups', data);
      return response.group || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create group');
    },
  });
}

export function useGroupDetails(groupJid: string) {
  return useQuery({
    queryKey: ['group', groupJid],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/groups/${groupJid}`);
      return data.group || null;
    },
    enabled: !!groupJid,
  });
}

export function useUpdateGroup(groupJid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { subject?: string; description?: string; isAnnounceGroup?: boolean }) => {
      const { data } = await api.put(`/whatsapp/groups/${groupJid}`, updates);
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupJid] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupJid: string) => {
      await api.delete(`/whatsapp/groups/${groupJid}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      toast.success('Group deleted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete group');
    },
  });
}

export function useGroupParticipants(groupJid: string) {
  return useQuery({
    queryKey: ['group-participants', groupJid],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/groups/${groupJid}/participants`);
      return (data.participants || []) as GroupParticipant[];
    },
    enabled: !!groupJid,
  });
}

export function useAddParticipant(groupJid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      const { data } = await api.post(`/whatsapp/groups/${groupJid}/participants`, { phoneNumber });
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-participants', groupJid] });
      toast.success('Participant added');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to add participant');
    },
  });
}

export function useRemoveParticipant(groupJid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (participantJid: string) => {
      await api.delete(`/whatsapp/groups/${groupJid}/participants/${participantJid}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-participants', groupJid] });
      toast.success('Participant removed');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to remove participant');
    },
  });
}

// ==========================================
// TEMPLATES
// ==========================================

export interface MessageTemplate {
  id: string;
  instanceId: string;
  name: string;
  category: 'marketing' | 'transactional' | 'utility';
  language: string;
  status: 'approved' | 'pending' | 'rejected';
  components: any[]; // header, body, buttons with variables
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export function useTemplates(instanceId: string) {
  return useQuery({
    queryKey: ['templates', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/templates?instanceId=${instanceId}`);
      return (data.templates || []) as MessageTemplate[];
    },
    enabled: !!instanceId,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      instanceId: string;
      name: string;
      category: string;
      language: string;
      components: any[];
    }) => {
      const { data: response } = await api.post('/whatsapp/templates', data);
      return response.template || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template created');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create template');
    },
  });
}

export function useUpdateTemplate(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<MessageTemplate>) => {
      const { data } = await api.put(`/whatsapp/templates/${templateId}`, updates);
      return data || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update template');
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      await api.delete(`/whatsapp/templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete template');
    },
  });
}

export function useRenderTemplate(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: Record<string, string>) => {
      const { data } = await api.post(`/whatsapp/templates/${templateId}/render`, { variables });
      return data || null;
    },
    onSuccess: () => {
      toast.success('Template rendered successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to render template');
    },
  });
}

// ==========================================
// ANALYTICS
// ==========================================

export interface AnalyticsData {
  period: string;
  totalMessages: number;
  conversationsStarted: number;
  conversationsClosed: number;
  avgResponseTime: number;
  resolutionRate: number;
}

export interface AgentAnalytics {
  agentId: string;
  agentName: string;
  messagesHandled: number;
  avgResponseTime: number;
  satisfactionScore?: number;
}

export function useAnalytics(instanceId: string, period: 'day' | 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: ['analytics', instanceId, period],
    queryFn: async () => {
      const [convRes, msgRes, agentRes, slaRes] = await Promise.all([
        api.get(`/whatsapp/analytics/conversations?instanceId=${instanceId}&period=${period}`),
        api.get(`/whatsapp/analytics/messages?instanceId=${instanceId}&period=${period}`),
        api.get(`/whatsapp/analytics/agents?instanceId=${instanceId}&period=${period}`),
        api.get(`/whatsapp/analytics/sla?instanceId=${instanceId}&period=${period}`),
      ]);
      return {
        conversations: convRes.data || null,
        messages: msgRes.data || null,
        agents: agentRes.data || null,
        sla: slaRes.data || null,
      };
    },
    enabled: !!instanceId,
  });
}

// ==========================================
// WEBHOOK DELIVERIES
// ==========================================

export interface WebhookDelivery {
  id: string;
  instanceId: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  responseCode?: number;
  responseBody?: string;
  duration?: number;
  createdAt: string;
}

export function useWebhookDeliveries(instanceId: string, limit: number = 50) {
  return useQuery({
    queryKey: ['webhook-deliveries', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/webhook/deliveries?instanceId=${instanceId}&limit=${limit}`);
      return (data.deliveries || []) as WebhookDelivery[];
    },
    enabled: !!instanceId,
  });
}

// ==========================================
// USER PROFILE
// ==========================================

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: string;
  createdAt: string;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data.user as UserProfile;
    },
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string; email?: string }) => {
      const { data: response } = await api.put('/auth/profile', data);
      return response.user || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
      toast.success('Profile updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (credentials: { currentPassword: string; newPassword: string }) => {
      const { data } = await api.post('/auth/change-password', credentials);
      return data;
    },
    onSuccess: () => {
      toast.success('Password changed successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to change password');
    },
  });
}

// ==========================================
// SETTINGS (INSTANCE UPDATE)
// ==========================================

export function useUpdateInstance(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name?: string;
      webhookUrl?: string;
      webhookEvents?: string[];
      rejectCalls?: boolean;
      groupsIgnore?: boolean;
      alwaysOnline?: boolean;
      readReceipts?: boolean;
      readStatus?: boolean;
    }) => {
      // Extract settings fields
      const { name, webhookUrl, webhookEvents, rejectCalls, groupsIgnore, alwaysOnline, readReceipts, readStatus, ...rest } = data;

      // Build payload - send settings as nested object
      const payload: any = { ...rest };
      if (name !== undefined) payload.name = name;
      if (webhookUrl !== undefined) payload.webhookUrl = webhookUrl;
      if (webhookEvents !== undefined) payload.webhookEvents = webhookEvents;

      // Build settings object from individual flags
      const settings: any = {};
      if (rejectCalls !== undefined) settings.rejectCalls = rejectCalls;
      if (groupsIgnore !== undefined) settings.groupsIgnore = groupsIgnore;
      if (alwaysOnline !== undefined) settings.alwaysOnline = alwaysOnline;
      if (readReceipts !== undefined) settings.readReceipts = readReceipts;
      if (readStatus !== undefined) settings.readStatus = readStatus;

      if (Object.keys(settings).length > 0) {
        payload.settings = settings;
      }

      const { data: response } = await api.put(`/whatsapp/instances/${instanceId}`, payload);
      return response.instance || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance-status', instanceId] });
      toast.success('Instance updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update instance');
    },
  });
}

export function useSendMessage(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      chatJid: string;
      message: string;
      type?: 'text';
      mediaUrl?: string;
      quotedMessageId?: string;
    }) => {
      const payload: any = {
        number: data.chatJid,
        text: data.message,
      };
      if (data.mediaUrl) {
        payload.media = data.mediaUrl;
        payload.type = data.type || 'document';
      }
      const { data: response } = await api.post(`/whatsapp/instances/${instanceId}/send`, payload);
      return response.message || null;
    },
    onSuccess: (_, variables) => {
      // Note: We don't have instanceId here in closure? Actually we do via outer scope.
      // But we need to invalidate messages for the specific chat
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats', instanceId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', instanceId, variables.chatJid] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to send message');
    },
  });
}

// ==========================================
// INTEGRATION GUIDE
// ==========================================

export function useIntegrationGuide(instanceId: string) {
  return useQuery({
    queryKey: ['integration-guide', instanceId],
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/instances/${instanceId}/integration-guide`);
      return data.guide || null;
    },
    enabled: !!instanceId,
  });
}

// ==========================================
// PUBLIC API (Instance-specific key auth)
// ==========================================

// These use the instance's evolutionApiKey, not JWT
// They need to be called with special headers

export interface PublicApiConfig {
  instanceId: string;
  apiKey: string;
}

export function createPublicApiClient(instanceId: string, apiKey: string) {
  return axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
      'apikey': apiKey,
      'Content-Type': 'application/json'
    }
  });
}

export function usePublicStatus(instanceId: string, apiKey: string) {
  return useQuery({
    queryKey: ['public-status', instanceId],
    queryFn: async () => {
      // Use fetch directly with instance API key
      const response = await fetch(`${import.meta.env.VITE_API_URL}/whatsapp/public/status/${instanceId}`, {
        headers: { 'apikey': apiKey }
      });
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    enabled: !!instanceId && !!apiKey,
    refetchInterval: 10000,
  });
}

