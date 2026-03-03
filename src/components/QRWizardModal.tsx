import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRWizard } from './QRWizard';

interface QRWizardModalProps {
  instanceId: string | null;
  onClose: () => void;
  onConnected: () => void;
}

export function QRWizardModal({ instanceId, onClose, onConnected }: QRWizardModalProps) {
  return (
    <AnimatePresence>
      {instanceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold">Connection Wizard</h3>
              <button onClick={onClose} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <QRWizard 
              instanceId={instanceId} 
              onConnected={onConnected}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
