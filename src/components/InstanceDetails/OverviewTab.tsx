/**
 * Overview Tab - Composed of device info, API key, reseller token
 */

import { DeviceInfo, ApiKeyCard, ResellerTokenCard } from './Overview';

interface Props {
  instance: any;
  copiedKey: string | null;
  onCopyKey: (key: string) => void;
  resellerTokenData: any;
  isLoadingResellerToken: boolean;
  isResellerNotConfigured: boolean;
  onRefetchResellerToken: () => void;
  onNavigate: (path: string) => void;
}

export function OverviewTab({
  instance,
  copiedKey,
  onCopyKey,
  resellerTokenData,
  isLoadingResellerToken,
  isResellerNotConfigured,
  onRefetchResellerToken,
  onNavigate
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-8">
        <DeviceInfo instance={instance} />
        <ApiKeyCard
          apiKey={instance.evolutionApiKey}
          copiedKey={copiedKey}
          onCopy={onCopyKey}
        />
        <ResellerTokenCard
          token={resellerTokenData?.token}
          expiresAt={resellerTokenData?.expiresAt}
          isLoading={isLoadingResellerToken}
          isError={isResellerNotConfigured}
          copiedKey={copiedKey}
          onCopy={onCopyKey}
          onRefetch={onRefetchResellerToken}
          onNavigate={onNavigate}
        />
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
  );
}
