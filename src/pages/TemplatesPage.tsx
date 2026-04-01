/**
 * Templates Page - Main container
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useTemplates, useCreateTemplate, useDeleteTemplate, useRenderTemplate } from '../hooks';
import { TemplatesHeader, TemplatesGrid, CreateTemplateModal, RenderTemplateModal } from '../components/Templates';
import { InstanceSelector } from '../components/common/InstanceSelector';
import { Loader2 } from 'lucide-react';
import { MessageTemplate } from '../types';

export function TemplatesPage() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRenderModalOpen, setIsRenderModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);

  // Form state
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState<'marketing' | 'transactional' | 'utility'>('marketing');
  const [templateLanguage, setTemplateLanguage] = useState('en');
  const [templateBody, setTemplateBody] = useState('');
  const [renderVariables, setRenderVariables] = useState('');

  const { data: templates, isLoading: isLoadingTemplates } = useTemplates(selectedInstanceId);
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const renderTemplate = useRenderTemplate(selectedTemplate?.id || '');

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  const handleCreateTemplate = async (e: React.FormEvent, name: string, category: string, language: string, body: string) => {
    e.preventDefault();
    if (!selectedInstanceId || !name.trim() || !body.trim()) return;

    const components = [{ type: 'BODY' as const, text: body.trim() }];

    try {
      await createTemplate.mutateAsync({
        instanceId: selectedInstanceId,
        name: name.trim(),
        category: category as any,
        language,
        components,
      });
      setIsCreateModalOpen(false);
      setTemplateName('');
      setTemplateBody('');
    } catch (error) {}
  };

  const handleDeleteTemplate = async (template: MessageTemplate) => {
    if (window.confirm(`Delete template "${template.name}"?`)) {
      try {
        await deleteTemplate.mutateAsync(template.id);
      } catch (error) {}
    }
  };

  const handleRenderTemplate = (template: MessageTemplate) => {
    setSelectedTemplate(template);
    setRenderVariables('');
    setIsRenderModalOpen(true);
  };

  const handleRenderSubmit = async (e: React.FormEvent, variables: string) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    try {
      const parsed = variables ? JSON.parse(variables) : {};
      await renderTemplate.mutateAsync(parsed);
      setIsRenderModalOpen(false);
    } catch (err) {
      throw new Error('Invalid JSON for variables');
    }
  };

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Select an instance to view templates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <TemplatesHeader onCreateClick={() => setIsCreateModalOpen(true)} />

      <InstanceSelector
        instances={instances || []}
        selectedInstanceId={selectedInstanceId}
        onSelect={setSelectedInstanceId}
      />

      <TemplatesGrid
        templates={templates || []}
        isLoading={isLoadingTemplates}
        onDelete={handleDeleteTemplate}
        onRender={handleRenderTemplate}
      />

      <CreateTemplateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTemplate}
        isPending={createTemplate.isPending}
      />

      <RenderTemplateModal
        isOpen={isRenderModalOpen}
        onClose={() => setIsRenderModalOpen(false)}
        template={selectedTemplate}
        onSubmit={handleRenderSubmit}
        isPending={renderTemplate.isPending}
      />
    </div>
  );
}
