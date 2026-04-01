/**
 * Webhook Security Info - Shows security details and save button
 */

import React from 'react';
import { motion } from 'motion/react';
import { Loader2, Save, CheckCircle2, ShieldCheck } from 'lucide-react';
import { EventSelection } from './EventSelection';

interface Props {
  onSave: () => void;
  isPending: boolean;
  isSuccess: boolean;
  isLoading: boolean;
  selectedEvents: string[];
  onToggleEvent: (event: string) => void;
  availableEvents: string[];
}

export function WebhookSecurityInfo({
  onSave,
  isPending,
  isSuccess,
  isLoading,
  selectedEvents,
  onToggleEvent,
  availableEvents
}: Props) {
  return (
    <>
      <div className="card bg-emerald-500/5 border-emerald-500/20">
        <h3 className="font-bold text-emerald-500 mb-2">Webhook Security</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">
          MAVENS signs all webhook requests with an HMAC-SHA256 signature.
          Verify the <code className="bg-zinc-800 px-1 rounded">X-Evolution-Signature</code> header
          using your organization's webhook secret.
        </p>
      </div>

      <div className="card space-y-4">
        <EventSelection
          selectedEvents={selectedEvents}
          onToggleEvent={onToggleEvent}
          availableEvents={availableEvents}
        />

        <button
          onClick={onSave}
          disabled={isPending || isLoading}
          className="btn-primary w-full py-3"
        >
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Configuration
            </>
          )}
        </button>

        {isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-emerald-500 text-sm justify-center"
          >
            <CheckCircle2 className="w-4 h-4" />
            Settings saved successfully
          </motion.div>
        )}
      </div>
    </>
  );
}
