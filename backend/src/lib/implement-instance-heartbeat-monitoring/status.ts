import { HeartbeatStatus, HeartbeatConfig, DEFAULT_HEARTBEAT_CONFIG } from './types';

export function calculateInstanceStatus(
  lastSeen: Date | null | undefined,
  now: Date = new Date(),
  config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG
): HeartbeatStatus {
  if (!lastSeen) {
    return 'UNKNOWN';
  }

  const diffMs = now.getTime() - lastSeen.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < config.onlineThreshold) {
    return 'ONLINE';
  } else if (diffSec < config.ttl) {
    // Between onlineThreshold and ttl, we consider OFFLINE but not yet expired
    return 'OFFLINE';
  }

  // If expired and beyond TTL, still OFFLINE
  return 'OFFLINE';
}

export function isInstanceOnline(
  lastSeen: Date | null | undefined,
  now: Date = new Date(),
  onlineThreshold: number = DEFAULT_HEARTBEAT_CONFIG.onlineThreshold
): boolean {
  if (!lastSeen) return false;
  return (now.getTime() - lastSeen.getTime()) / 1000 < onlineThreshold;
}
