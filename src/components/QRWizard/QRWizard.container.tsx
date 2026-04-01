/**
 * QR Wizard - Connect WhatsApp via QR code (container)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQRCode } from '../../hooks/instances';
import { useRealtimeQR, useRealtimeStatus } from '../../hooks';
import { useQueryClient } from '@tanstack/react-query';
import { QRWizardIdle, QRWizardGenerating, QRWizardScanning, QRWizardConnected } from './index';

interface QRWizardProps {
  instanceId: string;
  onConnected?: () => void;
}

export function QRWizard({ instanceId, onConnected }: QRWizardProps) {
  const [step, setStep] = useState<'idle' | 'generating' | 'scanning' | 'connected'>('idle');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const generateQR = useQRCode(instanceId);
  const { data: qrData, isLoading: isLoadingQR } = useRealtimeQR(instanceId, step === 'scanning');
  const { data: statusData } = useRealtimeStatus(instanceId, step === 'scanning');

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

  useEffect(() => {
    if (statusData?.status === 'CONNECTED' && step !== 'connected') {
      setStep('connected');
      onConnected?.();
    }
  }, [statusData, step, onConnected]);

  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!qrData?.expiresAt || step !== 'scanning') return;

    const updateCountdown = () => {
      const expires = new Date(qrData.expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setCountdown(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [qrData, step]);

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      {step === 'idle' && (
        <QRWizardIdle onGenerate={handleGenerate} isGenerating={generateQR.isPending} />
      )}

      {step === 'generating' && (
        <QRWizardGenerating />
      )}

      {step === 'scanning' && (
        <QRWizardScanning
          qrCode={qrData?.qrCode}
          pairingCode={qrData?.pairingCode}
          expiresAt={qrData?.expiresAt}
          onRegenerate={handleGenerate}
        />
      )}

      {step === 'connected' && (
        <QRWizardConnected instanceId={instanceId} />
      )}
    </div>
  );
}
