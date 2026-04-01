/**
 * Render Template Modal - Preview template with variables
 */

import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Play } from 'lucide-react';
import { MessageTemplate } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template: MessageTemplate | null;
  onSubmit: (e: FormEvent, variables: string) => Promise<void>;
  isPending: boolean;
}

export function RenderTemplateModal({ isOpen, onClose, template, onSubmit, isPending }: Props) {
  const [renderVariables, setRenderVariables] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    try {
      await onSubmit(e, renderVariables);
      setRenderVariables('');
    } catch (err: any) {
      alert(err.message || 'Invalid JSON');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && template && (
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
                <p className="text-sm text-zinc-500">{template.name}</p>
              </div>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn-primary">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Render
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
