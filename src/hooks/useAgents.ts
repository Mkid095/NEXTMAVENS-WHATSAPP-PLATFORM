/**
 * Agents Hook
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsService } from '../services/agents';
import { WhatsAppAgent, ChatAssignment } from '../types';
import toast from 'react-hot-toast';
import { agentKeys, chatKeys } from '../lib/queryKeys';

export function useAgents(instanceId: string) {
  return useQuery<WhatsAppAgent[], Error>({
    queryKey: agentKeys.byInstance(instanceId),
    queryFn: () => agentsService.fetchByInstance(instanceId),
    enabled: !!instanceId,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, name, avatar }: { instanceId: string; name: string; avatar?: string }) =>
      agentsService.create({ instanceId, name, avatar }),
    onMutate: async ({ instanceId }) => {
      await queryClient.cancelQueries({ queryKey: agentKeys.byInstance(instanceId) });
      const previous = queryClient.getQueryData(agentKeys.byInstance(instanceId));
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(agentKeys.byInstance(vars.instanceId), context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to create agent');
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.byInstance(vars.instanceId) });
    },
    onSuccess: () => {
      toast.success('Agent created');
    },
  });
}

export function useUpdateAgentStatus() {
  return useMutation({
    mutationFn: ({ agentId, status }: { agentId: string; status: 'available' | 'busy' | 'away' | 'offline' }) =>
      agentsService.updateStatus(agentId, status),
    onSuccess: () => {
      toast.success('Agent status updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update agent status');
    },
  });
}

export function useQueue(instanceId: string) {
  return useQuery({
    queryKey: agentKeys.queue(instanceId),
    queryFn: () => agentsService.fetchQueue(instanceId),
    enabled: !!instanceId,
    refetchInterval: 10000,
  });
}

export function useAssignments(instanceId: string) {
  return useQuery<ChatAssignment[], Error>({
    queryKey: agentKeys.assignment(instanceId),
    queryFn: () => agentsService.fetchAssignments(instanceId),
    enabled: !!instanceId,
  });
}

export function useAssignChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatJid, agentId, instanceId }: { chatJid: string; agentId: string; instanceId: string }) =>
      agentsService.assignChat(chatJid, agentId),
    onMutate: async ({ chatJid, agentId, instanceId }) => {
      await queryClient.cancelQueries({ queryKey: agentKeys.queue(instanceId) });
      await queryClient.cancelQueries({ queryKey: agentKeys.assignment(instanceId) });
      await queryClient.cancelQueries({ queryKey: chatKeys.forInstance(instanceId) });

      const previousQueue = queryClient.getQueryData(agentKeys.queue(instanceId));
      const previousAssignments = queryClient.getQueryData(agentKeys.assignment(instanceId));
      const previousChats = queryClient.getQueryData(chatKeys.forInstance(instanceId));

      // Optimistic update: move chat from queue to assignment
      queryClient.setQueryData(agentKeys.queue(instanceId), (old: any[]) => {
        return old?.filter((q) => q.chatJid !== chatJid) || [];
      });

      queryClient.setQueryData(agentKeys.assignment(instanceId), (old: any[]) => {
        return [...(old || []), { chatJid, agentId, assignedAt: new Date().toISOString() }];
      });

      queryClient.setQueryData(chatKeys.forInstance(instanceId), (old: any[]) => {
        return old?.map((chat) =>
          chat.jid === chatJid ? { ...chat, assignedTo: agentId } : chat
        ) || [];
      });

      return { previousQueue, previousAssignments, previousChats };
    },
    onError: (_err, vars, context) => {
      if (context?.previousQueue && vars.instanceId) {
        queryClient.setQueryData(agentKeys.queue(vars.instanceId), context.previousQueue);
      }
      if (context?.previousAssignments && vars.instanceId) {
        queryClient.setQueryData(agentKeys.assignment(vars.instanceId), context.previousAssignments);
      }
      if (context?.previousChats && vars.instanceId) {
        queryClient.setQueryData(chatKeys.forInstance(vars.instanceId), context.previousChats);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to assign chat');
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.queue(vars.instanceId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.assignment(vars.instanceId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.forInstance(vars.instanceId) });
    },
    onSuccess: () => {
      toast.success('Chat assigned to agent');
    },
  });
}
