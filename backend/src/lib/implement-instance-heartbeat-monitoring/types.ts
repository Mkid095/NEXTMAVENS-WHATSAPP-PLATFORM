export type HeartbeatStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface HeartbeatMetrics {
  cpu?: number;          // 0-1 (0% to 100%)
  memory?: number;      // 0-1
  queueSize?: number;   // pending messages
  uptime?: number;      // seconds
}

export interface HeartbeatRecord {
  instanceId: string;
  timestamp: number;    // Unix timestamp in milliseconds
  metrics?: HeartbeatMetrics;
}

export interface InstanceStatusView {
  id: string;
  name: string;
  phoneNumber: string;
  orgId: string;
  orgName: string;
  status: HeartbeatStatus;
  lastSeen: Date | null;
  metrics?: HeartbeatMetrics;
}

export interface StatusSummary {
  total: number;
  online: number;
  offline: number;
  unknown: number;
}

export interface HeartbeatConfig {
  /** Heartbeat interval in seconds (how often instances should call) */
  interval: number;
  /** TTL in seconds (should be 3 * interval) */
  ttl: number;
  /** Online threshold in seconds (2 * interval) */
  onlineThreshold: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  interval: 30,
  ttl: 90,
  onlineThreshold: 60,
};
