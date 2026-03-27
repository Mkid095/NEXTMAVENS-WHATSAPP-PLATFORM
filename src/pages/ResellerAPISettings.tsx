import React, { useState, useEffect } from 'react';
import { Key, Copy, Check, Loader2, RefreshCw, AlertCircle, Info, FileText } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

export function ResellerAPISettings() {
  const [tokenToCopy, setTokenToCopy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch the reseller JWT token
  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ['reseller-token'],
    queryFn: async () => {
      const response = await api.get('whatsapp/reseller/token');
      return response.data;
    },
    retry: false,
  });

  // Regenerate token (calls same endpoint to get fresh token)
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get('whatsapp/reseller/token');
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('New Reseller JWT token generated');
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate token');
    },
  });

  // Store token in localStorage when it's fetched
  useEffect(() => {
    if (data?.token) {
      localStorage.setItem('resellerJwtToken', data.token);
    }
  }, [data?.token]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success('Token copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const token = data?.token;
  const expiresAt = data?.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'N/A';

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Key className="w-8 h-8 text-emerald-500" />
            Reseller API
          </h1>
          <p className="text-zinc-400 mt-2 max-w-2xl">
            Generate and manage your Reseller JWT token. This token allows you to programmatically create and manage sub-instances via the Reseller API endpoints.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Token Display Card */}
          <div className="card space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Key className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Reseller JWT Token</h3>
                  <p className="text-xs text-zinc-500">Use this token for Reseller API authentication</p>
                </div>
              </div>
              <button
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", regenerateMutation.isPending && "animate-spin")} />
                Regenerate
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-red-400 mb-2">Reseller API Not Configured</h4>
                <p className="text-zinc-400 text-sm mb-4">
                  The Reseller JWT token has not been configured by the platform administrator. Please contact support to enable this feature.
                </p>
                <button
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  className="btn-primary mx-auto"
                >
                  {regenerateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    'Attempt to Generate'
                  )}
                </button>
              </div>
            ) : token ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">
                    Your Reseller JWT Token
                  </label>
                  <div className="relative">
                    <code className="block bg-zinc-800 border border-zinc-700 p-4 rounded-xl text-sm text-emerald-400 font-mono break-all">
                      {token}
                    </code>
                    <button
                      onClick={() => handleCopy(token)}
                      className="absolute top-3 right-3 p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Keep this token secure. Do not share it publicly. It will be used to authenticate Reseller API requests.
                  </p>
                </div>

                <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div className="text-sm text-blue-200">
                    <p className="font-medium">Token Expires</p>
                    <p className="text-xs text-blue-300/70">{expiresAt}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <p>No token available</p>
              </div>
            )}
          </div>

          {/* Usage Instructions */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              How to Use
            </h3>
            <div className="space-y-3 text-sm text-zinc-300">
              <p>
                Use this token as a Bearer token in the Authorization header when calling Reseller API endpoints:
              </p>
              <div className="bg-zinc-800 p-3 rounded-lg">
                <code className="text-xs text-emerald-400 font-mono">
                  Authorization: Bearer YOUR_RESLLER_JWT_TOKEN
                </code>
              </div>
              <p>Available Reseller endpoints:</p>
              <ul className="list-disc list-inside space-y-1 text-zinc-400">
                <li><code className="text-xs bg-zinc-800 px-1 rounded">POST /whatsapp/reseller/create-sub-instance</code> - Create a new sub-instance</li>
                <li><code className="text-xs bg-zinc-800 px-1 rounded">GET /whatsapp/reseller/sub-instances</code> - List all sub-instances</li>
                <li><code className="text-xs bg-zinc-800 px-1 rounded">GET /whatsapp/reseller/sub-instances/{'{id}'}/status</code> - Get sub-instance status</li>
                <li><code className="text-xs bg-zinc-800 px-1 rounded">DELETE /whatsapp/reseller/sub-instances/{'{id}'}</code> - Delete a sub-instance</li>
                <li><code className="text-xs bg-zinc-800 px-1 rounded">POST /whatsapp/reseller/send-bulk</code> - Send bulk messages</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Status Card */}
          <div className="card space-y-4">
            <h3 className="font-bold text-white">Token Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Status</span>
                <span className={cn(
                  "text-sm font-bold px-2 py-1 rounded",
                  token ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                )}>
                  {token ? 'Active' : 'Not Set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Expires</span>
                <span className="text-sm text-zinc-300">{expiresAt}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Type</span>
                <span className="text-sm text-zinc-300">JWT Bearer</span>
              </div>
            </div>
          </div>

          {/* Important Notes */}
          <div className="card bg-yellow-500/5 border-yellow-500/20 space-y-3">
            <h3 className="font-bold text-yellow-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Important
            </h3>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                <span>This token grants access to create and manage sub-instances on behalf of your organization.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                <span>Do not expose this token in client-side code or public repositories.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                <span>Regenerating the token will invalidate the previous one immediately.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                <span>Store the token securely on your server if using it in backend integrations.</span>
              </li>
            </ul>
          </div>

          {/* Quick Actions */}
          <div className="card space-y-3">
            <h3 className="font-bold text-white">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (token) {
                    navigator.clipboard.writeText(token);
                    toast.success('Token copied');
                  }
                }}
                disabled={!token}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all text-sm font-medium text-zinc-300"
              >
                <Copy className="w-4 h-4" />
                Copy Token
              </button>
              <button
                onClick={() => window.open('https://whatsapp.nextmavens.cloud/docs', '_blank')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all text-sm font-medium text-zinc-300"
              >
                <FileText className="w-4 h-4" />
                View API Docs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
