/**
 * Messages Hook - React Query wrapper around MessagesApi with real-time updates
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { messagesService } from '../services/messages';
import { webSocketService } from '../services/websocket';
import { WS_EVENTS } from '../services/websocket/events';
import { WhatsAppMessage } from '../types';
import { chatKeys, messageKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

export function useMessages(instanceId: string | null, chatJid: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery<WhatsAppMessage[], Error>({
    queryKey: chatJid && instanceId ? messageKeys.forChat(instanceId, chatJid) : ['messages'],
    queryFn: () => messagesService.fetchByChat(instanceId!, chatJid!),
    enabled: !!instanceId && !!chatJid,
    staleTime: 30000,
  });

  // WebSocket real-time updates
  useEffect(() => {
    if (!webSocketService.connected || !instanceId) return;

    webSocketService.subscribeToInstance(instanceId);
    const handleUpsert = (data: { message: WhatsAppMessage; instanceId: string; chatJid?: string }) => {
      if (data.instanceId !== instanceId) return;
      if (chatJid && data.chatJid !== chatJid) return;

      queryClient.setQueryData<WhatsAppMessage[]>(
        messageKeys.forChat(instanceId, chatJid!),
        (old = []) => {
          if (old.some(m => m.id === data.message.id)) return old;
          return [...old, data.message];
        }
      );
    };

    webSocketService.on(WS_EVENTS.MESSAGE_UPSERT, handleUpsert);

    return () => {
      webSocketService.unsubscribeFromInstance(instanceId);
      webSocketService.off(WS_EVENTS.MESSAGE_UPSERT, handleUpsert);
    };
  }, [instanceId, chatJid, queryClient]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, payload }: { instanceId: string; payload: { chatJid: string; message: string; type?: 'text'; mediaUrl?: string } }) =>
      messagesService.send(instanceId, payload),
    onMutate: async ({ instanceId, payload }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.forInstance(instanceId) });
      await queryClient.cancelQueries({ queryKey: messageKeys.forChat(instanceId, payload.chatJid) });

      const previousChats = queryClient.getQueryData(chatKeys.forInstance(instanceId));
      const previousMessages = queryClient.getQueryData(messageKeys.forChat(instanceId, payload.chatJid));

      // Optimistic add new message
      // We need to set placeholder 'from' since we may not know the exact instance JID yet
      const optimisticMessage: WhatsAppMessage = {
        id: `temp-${Date.now()}`,
        from: '', // will be populated by server response
        to: payload.chatJid,
        body: payload.message,
        type: payload.type || 'text',
        timestamp: Date.now(),
        fromMe: true,
        mediaUrl: payload.mediaUrl,
      };

      queryClient.setQueryData(messageKeys.forChat(instanceId, payload.chatJid), (old: WhatsAppMessage[] = []) => {
        return [...old, optimisticMessage];
      });

      queryClient.setQueryData(chatKeys.forInstance(instanceId), (old: any[]) => {
        return old?.map((chat) =>
          chat.jid === payload.chatJid ? { ...chat, lastMessage: payload.message, lastMessageTime: new Date().toISOString() } : chat
        ) || [];
      });

      return { previousChats, previousMessages };
    },
    onError: (error: any, vars, context) => {
      // Rollback optimistic updates
      if (context?.previousChats) {
        queryClient.setQueryData(chatKeys.forInstance(vars.instanceId), context.previousChats);
      }
      if (context?.previousMessages) {
        queryClient.setQueryData(messageKeys.forChat(vars.instanceId, vars.payload.chatJid), context.previousMessages);
      }
      // Show error toast
      toast.error(error.message || 'Failed to send message');
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.forInstance(vars.instanceId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.forChat(vars.instanceId, vars.payload.chatJid) });
    },
    onSuccess: () => {
      toast.success('Message sent');
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, keys }: { instanceId: string; keys: Array<{ remoteJid: string; fromMe: boolean }> }) =>
      messagesService.markRead(instanceId, { keys }),
    onMutate: async ({ instanceId }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.forInstance(instanceId) });
      const previousChats = queryClient.getQueryData(chatKeys.forInstance(instanceId));
      return { previousChats };
    },
    onError: (_err, vars, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(chatKeys.forInstance(vars.instanceId), context.previousChats);
      }
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.forInstance(vars.instanceId) });
    },
  });
}
