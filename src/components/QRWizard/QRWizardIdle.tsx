/**
 * QR Wizard Idle Step
 */

import React from 'react';
import { QrCode, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  onGenerate: () => void;
  isGenerating: boolean;
}

export function QRWizardIdle({ onGenerate, isGenerating }: Props) {
  return (
    <motion.div
      key="idle"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="text-center space-y-4"
    >
      <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
        <QrCode className="w-10 h-10 text-emerald-500" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Connect WhatsApp</h3>
        <p className="text-zinc-400 max-w-xs mx-auto">
          Generate a QR code to link your WhatsApp account to this instance.
        </p>
      </div>
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="btn-primary w-full py-3"
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating...
          </span>
        ) : (
          'Generate QR Code'
        )}
      </button>
    </motion.div>
  );
}
