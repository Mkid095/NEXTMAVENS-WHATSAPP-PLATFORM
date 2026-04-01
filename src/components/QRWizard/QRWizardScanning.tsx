/**
 * QR Wizard Scanning Step
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle, Timer, Copy, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

interface Props {
  qrCode: string | undefined;
  pairingCode?: string;
  expiresAt?: string;
  onRegenerate: () => void;
}

export function QRWizardScanning({ qrCode, pairingCode, expiresAt, onRegenerate }: Props) {
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;

    const updateCountdown = () => {
      const expires = new Date(expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setCountdown(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleCopyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      toast.success('Pairing code copied');
    }
  };

  return (
    <motion.div
      key="scanning"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      <div className="relative p-4 bg-white rounded-2xl inline-block shadow-2xl shadow-emerald-500/10">
        {qrCode ? (
          <img
            src={qrCode}
            alt="WhatsApp QR Code"
            className="w-64 h-64"
          />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center bg-zinc-100">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        )}

        {countdown <= 0 && qrCode && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 rounded-2xl">
            <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
            <p className="text-zinc-900 font-medium">QR Expired</p>
            <button
              onClick={onRegenerate}
              className="mt-4 text-emerald-600 font-semibold hover:underline"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2 text-zinc-400">
          <Timer className="w-4 h-4" />
          <span className={countdown < 10 ? 'text-red-400 font-mono' : 'font-mono'}>
            Expires in {countdown}s
          </span>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Scan with WhatsApp</p>
          <p className="text-sm text-zinc-500">
            Open WhatsApp &gt; Settings &gt; Linked Devices
          </p>
        </div>
      </div>

      {pairingCode && (
        <div className="pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Or use Pairing Code</p>
          <div className="bg-zinc-800 py-2 px-4 rounded-lg font-mono text-xl tracking-widest text-emerald-400 flex items-center justify-center gap-2">
            {pairingCode}
            <button onClick={handleCopyPairingCode} className="text-zinc-400 hover:text-white">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
