/**
 * QR Wizard Generating Step
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export function QRWizardGenerating() {
  return (
    <motion.div
      key="generating"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center space-y-4"
    >
      <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
      <p className="text-zinc-400">Initializing connection...</p>
    </motion.div>
  );
}
