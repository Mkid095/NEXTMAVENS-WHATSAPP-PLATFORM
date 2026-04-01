/**
 * QR Wizard Connected Step
 */

import React from 'react';
import { CheckCircle2, Code2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

interface Props {
  instanceId: string;
}

export function QRWizardConnected({ instanceId }: Props) {
  const navigate = useNavigate();

  return (
    <motion.div
      key="connected"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-4"
    >
      <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
      </div>
      <div className="space-y-4 pt-4">
        <button
          onClick={() => navigate(`/instances/${instanceId}`)}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          <Code2 className="w-5 h-5" />
          View Integration Guide
        </button>
        <p className="text-xs text-zinc-500">
          You can now start sending messages via API.
        </p>
      </div>
    </motion.div>
  );
}
