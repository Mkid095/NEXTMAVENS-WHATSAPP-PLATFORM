/**
 * Settings State Hook
 * Manages local state and handlers for the Settings page
 */

import { useEffect, useState } from 'react';
import { WhatsAppInstance } from '../types';

export interface SettingsState {
  profileName: string;
  profileStatus: string;
  rejectCalls: boolean;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readReceipts: boolean;
  readStatus: boolean;
  webhookUrl: string;
  webhookEvents: string[];
}

export function useSettingsState(selectedInstance?: WhatsAppInstance | null) {
  const [profileName, setProfileName] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [rejectCalls, setRejectCalls] = useState(false);
  const [groupsIgnore, setGroupsIgnore] = useState(false);
  const [alwaysOnline, setAlwaysOnline] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [readStatus, setReadStatus] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);

  const availableEvents = [
    'connection.status',
    'messages.upsert',
    'messages.update',
    'contacts.upsert',
    'groups.update',
    'presence.update'
  ];

  useEffect(() => {
    if (selectedInstance) {
      setProfileName(selectedInstance.profileName || selectedInstance.name);
      setProfileStatus('');
      setRejectCalls(selectedInstance.settings?.rejectCalls || false);
      setGroupsIgnore(selectedInstance.settings?.groupsIgnore || false);
      setAlwaysOnline(selectedInstance.settings?.alwaysOnline ?? true);
      setReadReceipts(selectedInstance.settings?.readReceipts ?? true);
      setReadStatus(selectedInstance.settings?.readStatus ?? true);
      setWebhookUrl(selectedInstance.webhookUrl || '');
      setWebhookEvents(selectedInstance.webhookEvents || []);
    }
  }, [selectedInstance]);

  const toggleWebhookEvent = (event: string) => {
    setWebhookEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  return {
    profileName,
    setProfileName,
    profileStatus,
    setProfileStatus,
    rejectCalls,
    setRejectCalls,
    groupsIgnore,
    setGroupsIgnore,
    alwaysOnline,
    setAlwaysOnline,
    readReceipts,
    setReadReceipts,
    readStatus,
    setReadStatus,
    webhookUrl,
    setWebhookUrl,
    webhookEvents,
    setWebhookEvents,
    availableEvents,
    toggleWebhookEvent,
  };
}
