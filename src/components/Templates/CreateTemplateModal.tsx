/**
 * Create Template Modal - Form to create new template
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent, name: string, category: string, language: string, body: string) => void;
  isPending: boolean;
}

export function CreateTemplateModal({ isOpen, onClose, onSubmit, isPending }: Props) {
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState<'marketing' | 'transactional' | 'utility'>('marketing');
  const [templateLanguage, setTemplateLanguage] = useState('en');
  const [templateBody, setTemplateBody] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    onSubmit(e, templateName, templateCategory, templateLanguage, templateBody);
    if (!isPending) {
      setTemplateName('');
      setTemplateBody('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="card bg-zinc-900 border-zinc-800 max-w-2xl w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Create New Template</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn-primary">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Create Template
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
