/**
 * Settings Tab Wrapper - Delegates to Settings page component
 */

import { Settings } from '../../../pages/Settings';

interface Props {
  instanceId: string;
}

export function SettingsTabWrapper({ instanceId }: Props) {
  return <Settings />;
}
