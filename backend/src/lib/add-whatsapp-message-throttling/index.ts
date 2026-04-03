/**
 * WhatsApp Message Throttling System
 * Rate limits outgoing WhatsApp messages per organization/instance.
 *
 * Architecture:
 * - types.ts: ThrottleConfig, ThrottleResult, ThrottleMetrics interfaces
 * - config.constants.ts: Default config and Redis key patterns
 * - redis.client.ts: Redis client getter/setter
 * - config.manager.ts: Config storage and retrieval
 * - throttle.engine.ts: Core throttling logic (checkThrottle, getStatus)
 * - admin.service.ts: Maintenance and metrics
 *
 * All files under 150 lines.
 */

// Re-export types
export * from './types';

// Re-export configuration
export { DEFAULT_THROTTLE, KEY_MINUTE, KEY_HOUR, CONFIG_KEY } from './config.constants';

// Re-export Redis client management
export { getRedisClient, setRedisClient } from './redis.client';

// Re-export config manager
export { configManager, type ConfigManager } from './config.manager';

// Re-export core engine functions
export { checkThrottle, getStatus } from './throttle.engine';

// Re-export admin functions
export {
  resetThrottle,
  getMetrics,
  resetMetrics,
  cleanupOldEntries
} from './admin.service';

// singleton instance
import { checkThrottle, getStatus } from './throttle.engine';
import { configManager } from './config.manager';
import { getMetrics, resetMetrics } from './admin.service';
import { resetThrottle } from './admin.service';

const whatsAppMessageThrottle = {
  check: checkThrottle,
  getStatus,
  setConfig: configManager.setConfig.bind(configManager),
  reset: resetThrottle,
  getMetrics,
  resetMetrics,
  loadConfigs: configManager.loadConfigs.bind(configManager),
};

export { whatsAppMessageThrottle };

// Export internal test helpers in dev/test mode
if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
  (whatsAppMessageThrottle as any)._internal = {
    configManager,
    getMetrics,
    resetMetrics,
    resetForTests: () => {
      configManager.getAllConfigs().clear();
      // re-init default
    }
  };
}
