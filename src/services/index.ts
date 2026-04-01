/**
 * Services - Centralized data layer
 *
 * All services follow a consistent pattern:
 * - *.api.ts: Pure HTTP calls (API classes)
 * - *.service.ts: Singleton service wrappers (preferred for application code)
 * - *.websocket.ts: Real-time WebSocket management (if applicable)
 * - index.ts: Central re-exports for convenient access
 *
 * NOTE: Prefer importing service singletons (e.g., instancesService) directly from
 * their domain submodules (e.g., '../services/instances') to keep imports tree-shakeable.
 * This index provides a consolidated export for convenience only.
 */

// Core infrastructure
export { getApiService } from './api';
export { webSocketService } from './websocket';

// Domain service singletons (preferred)
export { instancesService } from './instances';
export { chatsService } from './chats';
export { messagesService } from './messages';
export { groupsService } from './groups';
export { templatesService } from './templates';
export { agentsService } from './agents';
export { webhooksService } from './webhooks';
export { analyticsService } from './analytics';
export { authService } from './auth';
export { resellerService } from './reseller';
export { settingsService } from './settings';
