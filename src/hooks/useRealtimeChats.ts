import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { api } from '../lib/api';
import { WS_EVENTS } from '../services/websocket/events';
import { WhatsAppChat } from '../types';

/**
 * Hook: Real-time chat list updates with WebSocket + polling fallback
 *
 * Subscribes to chat metadata updates (lastMessage, lastMessageAt) via WebSocket.
 * Falls back to HTTP polling when WebSocket is disconnected.
 *
 * Event: whatsapp:chat:update
 * Payload: { chatId, lastMessageAt, lastMessage, updatedAt }
 */
export function useRealtimeChats(instanceId: string) {
  const queryClient = useQueryClient();

  // HTTP polling query as fallback
  const query = useQuery<WhatsAppChat[], Error>({
    queryKey: ['whatsapp-chats', instanceId],
    queryFn: async (): Promise<WhatsAppChat[]> => {
      const { data } = await api.get<{ chats: WhatsAppChat[] }>(`whatsapp/instances/${instanceId}/chats`);
      return data.chats || [];
    },
    enabled: !!instanceId,
    staleTime: 120000, // 2 minutes
    gcTime: 300000, // 5 minutes
  });

  const { isConnected, subscribeToInstance, unsubscribeFromInstance, on, off } = useWebSocket();

  // WebSocket subscription for real-time chat updates
  useEffect(() => {
    if (!isConnected || !instanceId) return;

    console.log('[useRealtimeChats] Subscribing to chat updates for instance:', instanceId);
    subscribeToInstance(instanceId);

    const handleChatUpdate = (data: {
      chatId: string;
      lastMessageAt: number;
      lastMessage: string;
      updatedAt: number;
    }) => {
      console.log('[useRealtimeChats] Chat update received:', data);

      // Update the specific chat in the cache while preserving other fields
      queryClient.setQueryData<WhatsAppChat[]>(['whatsapp-chats', instanceId], (old = []) => {
        return old.map(chat => {
          if (chat.id === data.chatId) {
            return {
              ...chat,
              lastMessage: data.lastMessage,
              lastMessageTime: data.lastMessageAt,
            };
          }
          return chat;
        });
      });
    };

    on(WS_EVENTS.CHAT_UPDATE, handleChatUpdate);

    return () => {
      unsubscribeFromInstance(instanceId);
      off(WS_EVENTS.CHAT_UPDATE, handleChatUpdate);
    };
  }, [isConnected, instanceId, subscribeToInstance, unsubscribeFromInstance, on, off, queryClient]);

  // HTTP polling fallback when WebSocket disconnected
  useEffect(() => {
    if (!instanceId || isConnected) return;

    const intervalId = setInterval(() => {
      query.refetch();
    }, 10000); // Poll every 10 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [instanceId, isConnected, query]);

  return {
    ...query,
    isWebSocketConnected: isConnected,
  };
}
