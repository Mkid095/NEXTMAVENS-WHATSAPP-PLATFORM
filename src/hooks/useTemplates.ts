/**
 * Templates Hook - React Query wrapper around TemplatesApi
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesService } from '../services/templates';
import { MessageTemplate } from '../types';
import { templateKeys } from '../lib/queryKeys';
import toast from 'react-hot-toast';

interface CreateTemplateData {
  instanceId: string;
  name: string;
  category: 'marketing' | 'transactional' | 'utility';
  language: string;
  components: any[];
}

export function useTemplates(instanceId: string) {
  return useQuery<MessageTemplate[], Error>({
    queryKey: templateKeys.forInstance(instanceId),
    queryFn: () => templatesService.fetchByInstance(instanceId),
    enabled: !!instanceId,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateData) =>
      templatesService.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: templateKeys.forInstance(data.instanceId) });
      const previous = queryClient.getQueryData(templateKeys.forInstance(data.instanceId));

      // Optimistic add
      const optimisticTemplate: MessageTemplate = {
        id: `temp-${Date.now()}`,
        instanceId: data.instanceId,
        name: data.name,
        category: data.category,
        language: data.language,
        components: data.components,
        status: 'pending',
        variables: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(templateKeys.forInstance(data.instanceId), (old: MessageTemplate[] = []) => {
        return [...old, optimisticTemplate];
      });

      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(templateKeys.forInstance(vars.instanceId), context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to create template');
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.forInstance(vars.instanceId) });
    },
    onSuccess: () => {
      toast.success('Template created');
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => templatesService.delete(templateId),
    onMutate: async (templateId) => {
      await queryClient.cancelQueries({ queryKey: templateKeys.all });
      const previous = queryClient.getQueryData(templateKeys.all);
      queryClient.setQueryData(templateKeys.all, (old: MessageTemplate[] = []) => {
        return old.filter(t => t.id !== templateId);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(templateKeys.all, context.previous);
      }
      toast.error(_err instanceof Error ? _err.message : 'Failed to delete template');
    },
    onSettled: (_data, _error) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
    onSuccess: () => {
      toast.success('Template deleted');
    },
  });
}

export function useRenderTemplate(templateId: string) {
  return useMutation({
    mutationFn: (variables: Record<string, string>) => templatesService.render(templateId, variables),
    onSuccess: () => {
      toast.success('Template rendered successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to render template');
    },
  });
}
