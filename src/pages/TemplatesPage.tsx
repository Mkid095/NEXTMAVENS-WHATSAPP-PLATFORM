import React, { useState, useEffect } from 'react';
import {
  useInstances,
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useRenderTemplate,
  MessageTemplate,
} from '../hooks/useWhatsApp';
import {
  FileText,
  Plus,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Check,
  Play,
  Tag,
  Globe,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

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

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstanceId || !templateName.trim() || !templateBody.trim()) return;

    const components = [
      { type: 'BODY', text: templateBody.trim() }
    ];

    try {
      await createTemplate.mutateAsync({
        instanceId: selectedInstanceId,
        name: templateName.trim(),
        category: templateCategory,
        language: templateLanguage,
        components,
      });
      toast.success('Template created');
      setTemplateName('');
      setTemplateBody('');
      setIsCreateModalOpen(false);
    } catch (error) {}
  };

  const handleDeleteTemplate = async (template: MessageTemplate) => {
    if (window.confirm(`Delete template "${template.name}"?`)) {
      try {
        await deleteTemplate.mutateAsync(template.id);
        toast.success('Template deleted');
      } catch (error) {}
    }
  };

  const handleRenderTemplate = async (template: MessageTemplate) => {
    setSelectedTemplate(template);
    setRenderVariables('');
    setIsRenderModalOpen(true);
  };

  const handleRenderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    let variables: Record<string, string> = {};
    try {
      variables = renderVariables ? JSON.parse(renderVariables) : {};
      await renderTemplate.mutateAsync(variables);
      toast.success('Template rendered (check API response)');
      setIsRenderModalOpen(false);
    } catch (err) {
      toast.error('Invalid JSON for variables');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500/10 text-emerald-500';
      case 'pending': return 'bg-yellow-500/10 text-yellow-500';
      case 'rejected': return 'bg-red-500/10 text-red-500';
      default: return 'bg-zinc-700 text-zinc-300';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Message Templates</h1>
          <p className="text-zinc-400 mt-1">Create and manage reusable message templates</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5" />
          Create Template
        </button>
      </div>

      {/* Instance Selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-zinc-400 mb-2">Select Instance</label>
        <select
          value={selectedInstanceId}
          onChange={(e) => setSelectedInstanceId(e.target.value)}
          className="input w-full max-w-xs"
        >
          {instances?.map(inst => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.status})
            </option>
          ))}
        </select>
      </div>

      {/* Templates List */}
      {isLoadingTemplates ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map(template => (
            <div key={template.id} className="card p-6 hover:border-emerald-500/30 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-white">{template.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(template.status)}`}>
                      {template.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Globe className="w-3 h-3" /> {template.language}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRenderTemplate(template)}
                    className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded"
                    title="Render Preview"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template)}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {template.components?.length > 0 && template.components.map((comp, idx) => (
                  <div key={idx} className="text-sm text-zinc-400">
                    <p className="text-xs text-zinc-500 uppercase">{comp.type}</p>
                    <p className="truncate">{comp.text || comp.mediaUrl || '[Complex component]'}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center border-dashed border-zinc-800">
          <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">No templates yet. Create your first template to get started.</p>
        </div>
      )}

      {/* Create Template Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card bg-zinc-900 border-zinc-800 max-w-2xl w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Create New Template</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateTemplate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Name</label>
                    <input
                      type="text"
                      required
                      className="input w-full"
                      placeholder="Template name"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Category</label>
                    <select
                      className="input w-full"
                      value={templateCategory}
                      onChange={e => setTemplateCategory(e.target.value as any)}
                    >
                      <option value="marketing">Marketing</option>
                      <option value="transactional">Transactional</option>
                      <option value="utility">Utility</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Language Code</label>
                  <input
                    type="text"
                    required
                    className="input w-full max-w-xs"
                    placeholder="en"
                    value={templateLanguage}
                    onChange={e => setTemplateLanguage(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Body Text</label>
                  <textarea
                    required
                    className="input w-full h-32"
                    placeholder="Hello {{name}}, your order is ready..."
                    value={templateBody}
                    onChange={e => setTemplateBody(e.target.value)}
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Use double curly braces for variables, e.g., {"{{name}}"}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={createTemplate.isPending} className="btn-primary">
                    {createTemplate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Create Template
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Render Modal */}
      <AnimatePresence>
        {isRenderModalOpen && selectedTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card bg-zinc-900 border-zinc-800 max-w-lg w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Render Template</h2>
                  <p className="text-sm text-zinc-500">{selectedTemplate.name}</p>
                </div>
                <button onClick={() => setIsRenderModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleRenderSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Variables (JSON)
                  </label>
                  <textarea
                    required
                    className="input w-full h-40 font-mono text-sm"
                    placeholder='{"name": "John", "order": "123"}'
                    value={renderVariables}
                    onChange={e => setRenderVariables(e.target.value)}
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Provide values for all variables used in the template
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsRenderModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={renderTemplate.isPending} className="btn-primary">
                    {renderTemplate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Render
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
