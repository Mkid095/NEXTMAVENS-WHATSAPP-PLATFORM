/**
 * Group Participants Hook
 * Queries and mutations for group participant management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { GroupParticipant } from '../../types';
import { groupKeys } from '../../lib/queryKeys';
import toast from 'react-hot-toast';

export function useGroupParticipants(groupJid: string) {
  return useQuery<GroupParticipant[], Error>({
    queryKey: groupKeys.participants(groupJid),
    queryFn: async (): Promise<GroupParticipant[]> => {
      const { data } = await api.get<{ participants: GroupParticipant[] }>(`whatsapp/groups/${groupJid}/participants`);
      return data.participants || [];
    },
    enabled: !!groupJid,
  });
}

export function useAddParticipant(groupJid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      const { data } = await api.post(`whatsapp/groups/${groupJid}/participants`, { phoneNumber });
      return data || null;
    },
    onMutate: async (phoneNumber) => {
      await queryClient.cancelQueries({ queryKey: groupKeys.participants(groupJid) });
      const previous = queryClient.getQueryData(groupKeys.participants(groupJid));

      // Optimistic add - construct participant with proper shape
      const optimisticParticipant: GroupParticipant = {
        id: `temp-${Date.now()}`,
        jid: `${phoneNumber}@s.whatsapp.net`,
        name: '',
        isAdmin: false,
      };

      queryClient.setQueryData<GroupParticipant[]>(groupKeys.participants(groupJid), (old = []) => {
        return [...old, optimisticParticipant];
      });

      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(groupKeys.participants(groupJid), context.previous);
      }
      toast.error(error.message || 'Failed to add participant');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.participants(groupJid) });
    },
    onSuccess: () => {
      toast.success('Participant added');
    },
  });
}

export function useRemoveParticipant(groupJid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (participantJid: string) => {
      await api.delete(`whatsapp/groups/${groupJid}/participants/${participantJid}`);
    },
    onMutate: async (participantJid) => {
      await queryClient.cancelQueries({ queryKey: groupKeys.participants(groupJid) });
      const previous = queryClient.getQueryData(groupKeys.participants(groupJid));

      queryClient.setQueryData<GroupParticipant[]>(groupKeys.participants(groupJid), (old = []) => {
        return old.filter(p => p.jid !== participantJid);
      });

      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(groupKeys.participants(groupJid), context.previous);
      }
      toast.error(error.message || 'Failed to remove participant');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.participants(groupJid) });
    },
    onSuccess: () => {
      toast.success('Participant removed');
    },
  });
}
