/**
 * Instance Details Page - Main container
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInstances, useResellerToken } from '../../hooks';
import { motion, AnimatePresence } from 'motion/react';
import { InstanceHeader } from './InstanceHeader';
import { InstanceTabs } from './InstanceTabs';
import { OverviewTab } from './OverviewTab';
import { IntegrationGuideTab } from './IntegrationGuideTab';
import { AccessTab } from './AccessTab';
import { SubInstancesTab } from '../SubInstancesTab';
import { SettingsTabWrapper } from './tabs/SettingsTabWrapper';
import { Loader2, AlertCircle } from 'lucide-react';

export function InstanceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'integration' | 'access' | 'subinstances' | 'settings'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: instances, isLoading: isLoadingInstances } = useInstances();
  const instance = instances?.find(i => i.id === id);
  const { data: resellerTokenData, isLoading: isLoadingResellerToken, error: resellerTokenError, refetch: refetchResellerToken } = useResellerToken();

  const isResellerNotConfigured = !resellerTokenData?.token || !!resellerTokenError;

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  useEffect(() => {
    if (resellerTokenData?.token) {
      localStorage.setItem('resellerJwtToken', resellerTokenData.token);
    }
  }, [resellerTokenData?.token]);

  if (isLoadingInstances) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Loading instance details...</p>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-white">Instance Not Found</h2>
        <button onClick={() => navigate('/instances')} className="btn-primary mt-6 flex items-center gap-2">
          ← Back to Instances
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <InstanceHeader
        instance={instance}
        onBack={() => navigate('/instances')}
        resellerTokenData={resellerTokenData}
        isLoadingResellerToken={isLoadingResellerToken}
        onRefetchResellerToken={refetchResellerToken}
        isResellerNotConfigured={isResellerNotConfigured}
        navigate={navigate}
      />

      <InstanceTabs activeTab={activeTab} setActiveTab={setActiveTab} instance={instance} />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <OverviewTab
              instance={instance}
              copiedKey={copiedKey}
              onCopyKey={handleCopyKey}
              resellerTokenData={resellerTokenData}
              isLoadingResellerToken={isLoadingResellerToken}
              isResellerNotConfigured={isResellerNotConfigured}
              onRefetchResellerToken={refetchResellerToken}
              onNavigate={navigate}
            />
          )}
          {activeTab === 'integration' && (
            <IntegrationGuideTab
              instanceId={instance.id}
              apiKey={instance.evolutionApiKey}
              webhookSecret={instance.webhookSecret}
            />
          )}
          {activeTab === 'access' && (
            <AccessTab
              instanceId={instance.id}
              copiedKey={copiedKey}
              onCopyKey={handleCopyKey}
            />
          )}
          {activeTab === 'subinstances' && !instance.isSubInstance && (
            <SubInstancesTab parentInstanceId={instance.id} />
          )}
          {activeTab === 'settings' && (
            <SettingsTabWrapper instanceId={instance.id} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
