/**
 * Templates Grid - Display all templates for selected instance
 */

import { MessageTemplate } from '../../types';
import { Loader2, FileText, Play, Trash2, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  templates: MessageTemplate[];
  isLoading: boolean;
  onDelete: (template: MessageTemplate) => void;
  onRender: (template: MessageTemplate) => void;
}

export function TemplatesGrid({ templates, isLoading, onDelete, onRender }: Props) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500/10 text-emerald-500';
      case 'pending': return 'bg-yellow-500/10 text-yellow-500';
      case 'rejected': return 'bg-red-500/10 text-red-500';
      default: return 'bg-zinc-700 text-zinc-300';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="card p-12 text-center border-dashed border-zinc-800">
        <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-500">No templates yet. Create your first template to get started.</p>
      </div>
    );
  }

  return (
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
                onClick={() => onRender(template)}
                className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded"
                title="Render Preview"
              >
                <Play className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(template)}
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
  );
}
