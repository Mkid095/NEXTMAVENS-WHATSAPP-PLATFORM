import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInstances, useApiKeys, useCreateApiKey, useDeleteApiKey } from '../hooks/useWhatsApp';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Smartphone,
  Code2,
  Key,
  Activity,
  Settings as SettingsIcon,
  Loader2,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  Users,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { IntegrationGuide } from '../components/IntegrationGuide';
import { SubInstancesTab } from '../components/SubInstancesTab';
import { Settings } from '../pages/Settings';
import { format } from 'date-fns';

export function InstanceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'integration' | 'access' | 'settings'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');

  const { data: instances, isLoading: isLoadingInstances } = useInstances();
  const instance = instances?.find(i => i.id === id);

  const { data: apiKeys, isLoading: isLoadingKeys } = useApiKeys(id || '');
  const createKey = useCreateApiKey(id || '');
  const deleteKey = useDeleteApiKey(id || '');

  // Fetch Reseller JWT Token for the organization
  const { data: resellerTokenData, isLoading: isLoadingResellerToken, error: resellerTokenError, refetch: refetchResellerToken } = useQuery({
    queryKey: ['reseller-token', instance?.orgId],
    queryFn: async () => {
      const response = await api.get('/whatsapp/reseller/token');
      return response.data;
    },
    enabled: !!instance?.orgId,
    retry: false,
  });

  // Safely check if error is a 503 (reseller not configured)
  const isResellerNotConfigured = resellerTokenError && (resellerTokenError as any)?.response?.status === 503;

  // Store reseller token in localStorage for SubInstancesTab and other reseller API calls
  useEffect(() => {
    if (resellerTokenData?.token) {
      localStorage.setItem('resellerJwtToken', resellerTokenData.token);
    }
  }, [resellerTokenData?.token]);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    await createKey.mutateAsync({ name: newKeyName });
    setNewKeyName('');
  };

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
        <button onClick={() => navigate('/instances')} className="btn-primary mt-6">
          <ArrowLeft className="w-4 h-4" /> Back to Instances
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'integration', label: 'Integration Guide', icon: Code2 },
    { id: 'access', label: 'API Access', icon: Key },
    { id: 'subinstances', label: 'Sub-Instances', icon: Users, showWhen: !instance?.isSubInstance }, // Hide for sub-instances
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/instances')}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white">{instance.name}</h1>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                instance.status === 'CONNECTED' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}>
                {instance.status}
              </span>
            </div>
            <p className="text-zinc-500 mt-1">ID: {instance.id}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-8">
                <div className="card space-y-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                    Device Information
                  </h3>
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Phone Number</p>
                      <p className="text-lg font-medium text-zinc-200">{instance.phoneNumber || 'Not Connected'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Profile Name</p>
                      <p className="text-lg font-medium text-zinc-200">{instance.profileName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Battery Level</p>
                      <p className="text-lg font-medium text-zinc-200">{instance.battery ? `${instance.battery}%` : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Created At</p>
                      <p className="text-lg font-medium text-zinc-200">{format(new Date(instance.createdAt), 'MMM dd, yyyy')}</p>
                    </div>
                  </div>
                </div>

                {/* WhatsApp API Key */}
                <div className="card bg-blue-500/5 border-blue-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-blue-500">WhatsApp API Key</h3>
                    <button
                      onClick={() => copyKey(instance.evolutionApiKey || '')}
                      className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                    >
                      {copiedKey === instance.evolutionApiKey ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-zinc-400 mb-3">Use this key in the <code className="text-zinc-300 bg-zinc-800 px-1 rounded">apikey</code> header for public API calls.</p>
                  <code className="text-sm text-blue-400 font-mono block bg-zinc-900 px-3 py-3 rounded break-all">
                    {instance.evolutionApiKey || 'Not generated yet. Connect your device to generate API key.'}
                  </code>
                </div>

                {/* Reseller JWT Token */}
                <div className="card bg-purple-500/5 border-purple-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-purple-500">Reseller JWT Token</h3>
                    <button
                      onClick={() => refetchResellerToken()}
                      disabled={isLoadingResellerToken}
                      className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg transition-all flex items-center gap-1"
                    >
                      {isLoadingResellerToken ? (
                        <>Refreshing...</>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Refresh
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-zinc-400 mb-3">
                    Use this token to authenticate Reseller API requests for creating and managing sub-instances.
                  </p>
                  {isLoadingResellerToken && !resellerTokenData ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    </div>
                  ) : resellerTokenError ? (
                    <div className="text-center py-4">
                      <p className="text-red-400 mb-3">
                        {isResellerNotConfigured
                          ? 'Reseller API not configured by platform administrator.'
                          : 'Failed to load Reseller JWT token.'}
                      </p>
                      <button
                        onClick={() => navigate('/reseller-api')}
                        className="btn-primary text-sm inline-flex items-center gap-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Go to Reseller API Settings
                      </button>
                    </div>
                  ) : resellerTokenData?.token ? (
                    <div>
                      <code className="text-sm text-purple-400 font-mono block bg-zinc-900 px-3 py-3 rounded break-all">
                        {resellerTokenData.token}
                      </code>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-zinc-500">
                          Expires: {resellerTokenData.expiresAt ? new Date(resellerTokenData.expiresAt).toLocaleDateString() : 'N/A'}
                        </p>
                        <button
                          onClick={() => copyKey(resellerTokenData.token!)}
                          className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                        >
                          {copiedKey === resellerTokenData.token ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedKey === resellerTokenData.token ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-zinc-500 mb-3">No Reseller JWT token generated yet.</p>
                      <button
                        onClick={() => navigate('/reseller-api')}
                        className="btn-primary text-sm inline-flex items-center gap-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Generate Token
                      </button>
                    </div>
                  )}
                </div>

              </div>

              <div className="space-y-8">
                <div className="card bg-emerald-500/5 border-emerald-500/20">
                  <h3 className="font-bold text-emerald-500 mb-2">Instance Status</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Your instance is currently {instance.status.toLowerCase()}.
                    {instance.status === 'CONNECTED'
                      ? ' All services are operational and ready for integration.'
                      : ' Please connect your device to start using the API.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integration' && (
            <IntegrationGuide instanceId={instance.id} apiKey={instance.evolutionApiKey} webhookSecret={instance.webhookSecret} />
          )}

          {activeTab === 'subinstances' && !instance.isSubInstance && (
            <SubInstancesTab parentInstanceId={instance.id} />
          )}

          {activeTab === 'access' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">API Access Keys</h3>
                  <p className="text-zinc-500 text-sm mt-1">Manage specific access tokens for this instance.</p>
                </div>
                <form onSubmit={handleCreateKey} className="flex items-center gap-2">
                  <input 
                    type="text"
                    placeholder="Key Name (e.g. CRM Integration)"
                    className="input min-w-[240px]"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                  <button 
                    type="submit"
                    disabled={createKey.isPending || !newKeyName.trim()}
                    className="btn-primary"
                  >
                    {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Key
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {isLoadingKeys ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                ) : apiKeys?.length === 0 ? (
                  <div className="card p-12 text-center border-dashed border-zinc-800">
                    <Key className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500">No API keys created yet. Create one to start integrating.</p>
                  </div>
                ) : (
                  apiKeys?.map(apiKey => (
                    <div key={apiKey.id} className="card flex items-center justify-between group hover:border-zinc-700 transition-all">
                      <div className="flex items-center gap-6">
                        <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                          <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-100">{apiKey.name}</h4>
                          <div className="flex items-center gap-3 mt-1">
                            <code className="text-xs text-zinc-500 font-mono">
                              {apiKey.key.substring(0, 8)}••••••••••••••••
                            </code>
                            <button 
                              onClick={() => copyKey(apiKey.key)}
                              className="text-zinc-500 hover:text-emerald-500 transition-colors"
                            >
                              {copiedKey === apiKey.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Created</p>
                          <p className="text-xs text-zinc-400">{format(new Date(apiKey.createdAt), 'MMM dd, yyyy')}</p>
                        </div>
                        <button 
                          onClick={() => deleteKey.mutate(apiKey.id)}
                          className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <Settings />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
