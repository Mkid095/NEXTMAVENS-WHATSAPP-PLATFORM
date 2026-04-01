/**
 * Settings Service
 *
 * Provides a singleton wrapper around SettingsApi for convenient access
 */

import { SettingsApi } from './settings.api';

const settingsService = {
  api: new SettingsApi(),
};

export { settingsService };
