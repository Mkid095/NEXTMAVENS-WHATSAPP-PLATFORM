/**
 * Chats Hook - React Query wrapper around ChatsApi
 */

import { useQuery } from '@tanstack/react-query';
import { chatsService } from '../services/chats';
import { WhatsAppChat } from '../types';
import { chatKeys } from '../lib/queryKeys';

export function useChats(instanceId: string | null) {
  return useQuery<WhatsAppChat[], Error>({
    queryKey: chatKeys.forInstance(instanceId!),
    queryFn: () => chatsService.fetchByInstance(instanceId!),
    enabled: !!instanceId,
    staleTime: 10000,
  });
}
