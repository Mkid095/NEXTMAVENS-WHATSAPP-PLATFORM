/**
 * Unit Tests: Instance Heartbeat Monitoring - Status Calculation
 *
 * Tests the pure status calculation logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateInstanceStatus,
  isInstanceOnline,
  DEFAULT_HEARTBEAT_CONFIG,
} from '../lib/implement-instance-heartbeat-monitoring/status';

describe('Instance Heartbeat Status Calculation', () => {
  const now = new Date('2025-03-17T12:00:00Z').getTime();

  describe('calculateInstanceStatus', () => {
    it('should return UNKNOWN when lastSeen is null', () => {
      const status = calculateInstanceStatus(null);
      assert.strictEqual(status, 'UNKNOWN');
    });

    it('should return ONLINE when lastSeen is within onlineThreshold', () => {
      const lastSeen = new Date(now - 30 * 1000); // 30 seconds ago
      const status = calculateInstanceStatus(lastSeen, new Date(now), {
        ...DEFAULT_HEARTBEAT_CONFIG,
        onlineThreshold: 60,
      });
      assert.strictEqual(status, 'ONLINE');
    });

    it('should return OFFLINE when lastSeen is between onlineThreshold and ttl', () => {
      const lastSeen = new Date(now - 75 * 1000); // 75 seconds ago
      const status = calculateInstanceStatus(lastSeen, new Date(now), {
        ...DEFAULT_HEARTBEAT_CONFIG,
        onlineThreshold: 60,
        ttl: 90,
      });
      assert.strictEqual(status, 'OFFLINE');
    });

    it('should return OFFLINE when lastSeen is beyond ttl', () => {
      const lastSeen = new Date(now - 120 * 1000); // 120 seconds ago
      const status = calculateInstanceStatus(lastSeen, new Date(now), {
        ...DEFAULT_HEARTBEAT_CONFIG,
        onlineThreshold: 60,
        ttl: 90,
      });
      assert.strictEqual(status, 'OFFLINE');
    });

    it('should use default config values', () => {
      const lastSeen = new Date(now - 30 * 1000);
      const status = calculateInstanceStatus(lastSeen, new Date(now));
      assert.strictEqual(status, 'ONLINE');
    });
  });

  describe('isInstanceOnline', () => {
    it('should return false when lastSeen is null', () => {
      const online = isInstanceOnline(null);
      assert.strictEqual(online, false);
    });

    it('should return true when lastSeen is within threshold', () => {
      const lastSeen = new Date(now - 30 * 1000);
      const online = isInstanceOnline(lastSeen, new Date(now), 60);
      assert.strictEqual(online, true);
    });

    it('should return false when lastSeen is beyond threshold', () => {
      const lastSeen = new Date(now - 70 * 1000);
      const online = isInstanceOnline(lastSeen, new Date(now), 60);
      assert.strictEqual(online, false);
    });
  });
});
