/**
 * Settings Page - Main container
 */

import React, { useState, useEffect } from 'react';
import { useInstances, useUpdateProfile, useUpdateInstance } from '../hooks';
import { SettingsHeader } from '../components/Settings/SettingsHeader';
import { Loader2 } from 'lucide-react';
import { ProfileSettings } from '../components/Settings/ProfileSettings';
import { BehaviorSettings } from '../components/Settings/BehaviorSettings';
import { WebhookSettings } from '../components/Settings/WebhookSettings';
import { DangerZone } from '../components/Settings/DangerZone';
import { ApiCredentialsBox } from '../components/Settings/ApiCredentialsBox';
import toast from 'react-hot-toast';
import { useSettingsState } from '../hooks/useSettingsState';

export function Settings() {
  const { data: instances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const updateProfile = useUpdateProfile(selectedInstanceId || '');
  const updateInstance = useUpdateInstance(selectedInstanceId || '');

  const selectedInstance = instances?.find(i => i.id === selectedInstanceId);
  const {
    profileName, setProfileName,
    profileStatus, setProfileStatus,
    rejectCalls, setRejectCalls,
    groupsIgnore, setGroupsIgnore,
    alwaysOnline, setAlwaysOnline,
    readReceipts, setReadReceipts,
    readStatus, setReadStatus,
    webhookUrl, setWebhookUrl,
    webhookEvents,
    toggleWebhookEvent,
    availableEvents,
  } = useSettingsState(selectedInstance);

  useEffect(() => {
    if (instances && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      if (firstConnected) setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  const handleSaveProfile = async () => {
    if (!selectedInstanceId) return;
    try {
      await updateProfile.mutateAsync({ name: profileName, status: profileStatus });
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedInstanceId) return;
    try {
      await updateInstance.mutateAsync({
        rejectCalls,
        groupsIgnore,
        alwaysOnline,
        readReceipts,
        readStatus,
        webhookUrl: webhookUrl || undefined,
        webhookEvents: webhookEvents.length > 0 ? webhookEvents : undefined,
      });
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Loading instances...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsHeader
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        onSelectInstance={setSelectedInstanceId}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <ProfileSettings
            profileName={profileName}
            onProfileNameChange={setProfileName}
            profileStatus={profileStatus}
            onProfileStatusChange={setProfileStatus}
            onSave={handleSaveProfile}
            isPending={updateProfile.isPending}
          />

          <BehaviorSettings
            rejectCalls={rejectCalls}
            onToggleRejectCalls={() => setRejectCalls(!rejectCalls)}
            alwaysOnline={alwaysOnline}
            onToggleAlwaysOnline={() => setAlwaysOnline(!alwaysOnline)}
            groupsIgnore={groupsIgnore}
            onToggleGroupsIgnore={() => setGroupsIgnore(!groupsIgnore)}
            onSave={handleSaveSettings}
            isPending={updateInstance.isPending}
          />

          <WebhookSettings
            webhookUrl={webhookUrl}
            onWebhookUrlChange={setWebhookUrl}
            availableEvents={availableEvents}
            selectedEvents={webhookEvents}
            onToggleEvent={toggleWebhookEvent}
          />
        </div>

        <div className="space-y-8">
          <DangerZone />
          <ApiCredentialsBox selectedInstance={selectedInstance} />
        </div>
      </div>
    </div>
  );
}
