/**
 * WhatsApp Message Throttling - Config Manager
 * Handles throttle configuration storage and retrieval
 */

import type { ThrottleConfig } from './types';
import { DEFAULT_THROTTLE, CONFIG_KEY } from './config.constants';
import { getRedisClient } from './redis.client';

type ConfigKey = string;

/**
 * Generate unique config key for org+instance
 */
function getConfigKey(config: ThrottleConfig): ConfigKey {
  const org = config.orgId ?? 'global';
  const instance = config.instanceId ?? 'all';
  return `${org}:${instance}`;
}

/**
 * Config Manager class
 * Manages in-memory and Redis-persisted throttle configurations
 */
export class ConfigManager {
  private configs: Map<ConfigKey, ThrottleConfig> = new Map();

  constructor() {
    // Load default config
    this.configs.set(getConfigKey(DEFAULT_THROTTLE), DEFAULT_THROTTLE);
  }

  /**
   * Set throttle configuration for a specific org/instance
   * Overrides default or more specific configs.
   */
  async setConfig(config: ThrottleConfig): Promise<void> {
    const key = getConfigKey(config);
    this.configs.set(key, config);

    // Persist to Redis for multi-process access
    const redis = getRedisClient();
    await redis.hSet(CONFIG_KEY, key, JSON.stringify(config));
  }

  /**
   * Load all stored configs from Redis
   */
  async loadConfigs(): Promise<void> {
    const redis = getRedisClient();
    const raw = await redis.hGetAll(CONFIG_KEY);

    for (const [key, value] of Object.entries(raw)) {
      try {
        const config = JSON.parse(value as string) as ThrottleConfig;
        this.configs.set(key as ConfigKey, config);
      } catch (e) {
        console.warn(`Failed to parse throttle config for ${key}:`, e);
      }
    }
  }

  /**
   * Get the effective throttle config for an org+instance
   * Returns most specific match (org+instance > org > default)
   */
  getEffectiveConfig(orgId: string, instanceId: string): ThrottleConfig {
    // Try exact match
    const exactKey: ConfigKey = `${orgId}:${instanceId}`;
    if (this.configs.has(exactKey)) {
      return this.configs.get(exactKey)!;
    }

    // Try org-level (instanceId = 'all')
    const orgKey: ConfigKey = `${orgId}:all`;
    if (this.configs.has(orgKey)) {
      return this.configs.get(orgKey)!;
    }

    // Try global org-level (orgId = 'global')
    const globalKey: ConfigKey = `global:${instanceId}`;
    if (this.configs.has(globalKey)) {
      return this.configs.get(globalKey)!;
    }

    // Fall back to default
    return DEFAULT_THROTTLE;
  }

  /**
   * Get all configs (for inspection)
   */
  getAllConfigs(): Map<ConfigKey, ThrottleConfig> {
    return new Map(this.configs);
  }
}

// Singleton config manager
export const configManager = new ConfigManager();
