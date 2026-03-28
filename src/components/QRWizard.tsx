import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQRCode, useCachedQR, useInstanceStatus } from '../hooks/useWhatsApp';
import { getSocket, onQRCodeUpdate, subscribeToInstance, unsubscribeFromInstance } from '../lib/socket-client';
import { useQueryClient } from '@tanstack/react-query';
import { QrCode, Loader2, CheckCircle2, AlertCircle, Timer, Code2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QRWizardProps {
  instanceId: string;
  onConnected?: () => void;
}

export function QRWizard({ instanceId, onConnected }: QRWizardProps) {
  const [step, setStep] = useState<'idle' | 'generating' | 'scanning' | 'connected'>('idle');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const generateQR = useQRCode(instanceId);
  const { data: qrData, isLoading: isLoadingQR } = useCachedQR(instanceId, step === 'scanning');
  const { data: statusData } = useInstanceStatus(instanceId, step === 'scanning');

  const handleGenerate = async () => {
    setStep('generating');
    try {
      await generateQR.mutateAsync();
      setStep('scanning');
    } catch (error) {
      setStep('idle');
      console.error('Failed to generate QR:', error);
    }
  };

  // Listen for socket events for real-time QR updates
  useEffect(() => {
    if (step !== 'scanning') return;

    const token = localStorage.getItem('token');
    if (!token) return;

    // Subscribe to instance room
    const socket = getSocket();
    if (socket && socket.connected) {
      subscribeToInstance(instanceId);
    }

    const handleQRUpdate = (data: { instanceId: string; qrCode: string; status?: string; timestamp?: number }) => {
      if (data.instanceId === instanceId) {
        // Update the query cache with fresh QR data
        queryClient.setQueryData(['whatsapp-instance-qr', instanceId], {
          qrCode: data.qrCode,
          status: statusData?.status || data.status,
        });
      }
    };

    const handleStatusUpdate = (data: { instanceId: string; status: string }) => {
      if (data.instanceId === instanceId) {
        // If status becomes CONNECTED, move to connected step
        if (data.status === 'CONNECTED' && step !== 'connected') {
          setStep('connected');
          onConnected?.();
        }
      }
    };

    onQRCodeUpdate(handleQRUpdate);
    onInstanceStatus(handleStatusUpdate);

    return () => {
      // Cleanup: remove listeners and unsubscribe
      socket?.off('whatsapp:instance:qr:update', handleQRUpdate);
      socket?.off('whatsapp:instance:status', handleStatusUpdate);
      if (socket?.connected) {
        unsubscribeFromInstance(instanceId);
      }
    };
  }, [instanceId, step, onConnected, queryClient, statusData]);

  useEffect(() => {
    if (statusData?.status === 'CONNECTED' && step !== 'connected') {
      setStep('connected');
      onConnected?.();
    }
  }, [statusData, step, onConnected]);

  // Calculate QR expiry countdown
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!qrData?.expiresAt || step !== 'scanning') return;

    const updateCountdown = () => {
      const expires = new Date(qrData.expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setCountdown(diff);
      
      if (diff === 0 && step === 'scanning') {
        // Optionally auto-refresh or show expired state
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [qrData, step]);

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <AnimatePresence mode="wait">
        {step === 'idle' && (
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
              onClick={handleGenerate}
              disabled={generateQR.isPending}
              className="btn-primary w-full py-3"
            >
              {generateQR.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Generate QR Code'
              )}
            </button>
          </motion.div>
        )}

        {step === 'generating' && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center space-y-4"
          >
            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
            <p className="text-zinc-400">Initializing connection...</p>
          </motion.div>
        )}

        {step === 'scanning' && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6"
          >
            <div className="relative p-4 bg-white rounded-2xl inline-block shadow-2xl shadow-emerald-500/10">
              {qrData?.qrCode ? (
                <img 
                  src={qrData.qrCode} 
                  alt="WhatsApp QR Code" 
                  className="w-64 h-64"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-zinc-100">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
              )}
              
              {countdown <= 0 && qrData?.qrCode && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 rounded-2xl">
                  <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
                  <p className="text-zinc-900 font-medium">QR Expired</p>
                  <button 
                    onClick={handleGenerate}
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

            {qrData?.pairingCode && (
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Or use Pairing Code</p>
                <div className="bg-zinc-800 py-2 px-4 rounded-lg font-mono text-xl tracking-widest text-emerald-400">
                  {qrData.pairingCode}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {step === 'connected' && (
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
                className="btn-primary w-full py-3"
              >
                <Code2 className="w-5 h-5" />
                View Integration Guide
              </button>
              <p className="text-xs text-zinc-500">
                You can now start sending messages via API.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
