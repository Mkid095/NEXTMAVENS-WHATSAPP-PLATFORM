import React, { useState, useEffect } from 'react';
import { useInstances, useUpdateProfile, useUpdateSettings } from '../hooks/useWhatsApp';
import { Settings as SettingsIcon, User, Smartphone, Bell, Shield, Loader2, Save, CheckCircle2, AlertCircle, Power, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function Settings() {
  const { data: instances, refetch: refetchInstances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const updateProfile = useUpdateProfile(selectedInstanceId || '');
  const updateSettings = useUpdateSettings(selectedInstanceId || '');

  const selectedInstance = instances?.find(i => i.id === selectedInstanceId);

  const [profileName, setProfileName] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [rejectCalls, setRejectCalls] = useState(false);
  const [groupsIgnore, setGroupsIgnore] = useState(false);
  const [alwaysOnline, setAlwaysOnline] = useState(true);

  useEffect(() => {
    if (instances && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED') || instances[0];
      if (firstConnected) setSelectedInstanceId(firstConnected.id);
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    if (selectedInstance) {
      setProfileName(selectedInstance.profileName || selectedInstance.name);
      setProfileStatus(''); // Status isn't always in the instance object, might need separate fetch
      setRejectCalls(selectedInstance.settings?.rejectCalls || false);
      setGroupsIgnore(selectedInstance.settings?.groupsIgnore || false);
      setAlwaysOnline(selectedInstance.settings?.alwaysOnline || true);
    }
  }, [selectedInstance]);

  const handleSaveProfile = async () => {
    if (!selectedInstanceId) return;
    try {
      await updateProfile.mutateAsync({ name: profileName, status: profileStatus });
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedInstanceId) return;
    try {
      await updateSettings.mutateAsync({ rejectCalls, groupsIgnore, alwaysOnline });
    } catch (error) {
      console.error('Failed to update settings:', error);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-zinc-400 mt-1">Manage your instance profile and behavior settings.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium px-2">Instance:</span>
          <select 
            value={selectedInstanceId || ''} 
            onChange={(e) => setSelectedInstanceId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {instances?.map(inst => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Profile Settings */}
          <div className="card space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <User className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold">WhatsApp Profile</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Display Name</label>
                <input 
                  type="text"
                  className="input w-full"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Business Name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Status (About)</label>
                <input 
                  type="text"
                  className="input w-full"
                  value={profileStatus}
                  onChange={(e) => setProfileStatus(e.target.value)}
                  placeholder="Available"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button 
                onClick={handleSaveProfile}
                disabled={updateProfile.isPending}
                className="btn-primary"
              >
                {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile
              </button>
            </div>
          </div>

          {/* Instance Behavior */}
          <div className="card space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <Smartphone className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold">Instance Behavior</h3>
            </div>

            <div className="space-y-4">
              <div 
                onClick={() => setRejectCalls(!rejectCalls)}
                className={cn(
                  "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                  rejectCalls ? "bg-red-500/5 border-red-500/30" : "bg-zinc-800/30 border-zinc-800"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-2 rounded-lg", rejectCalls ? "bg-red-500/10 text-red-500" : "bg-zinc-800 text-zinc-500")}>
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Reject Calls</p>
                    <p className="text-xs text-zinc-500">Automatically decline incoming WhatsApp calls.</p>
                  </div>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  rejectCalls ? "bg-red-500" : "bg-zinc-700"
                )}>
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    rejectCalls ? "right-1" : "left-1"
                  )} />
                </div>
              </div>

              <div 
                onClick={() => setAlwaysOnline(!alwaysOnline)}
                className={cn(
                  "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                  alwaysOnline ? "bg-emerald-500/5 border-emerald-500/30" : "bg-zinc-800/30 border-zinc-800"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-2 rounded-lg", alwaysOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-800 text-zinc-500")}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Always Online</p>
                    <p className="text-xs text-zinc-500">Keep the instance status as 'Online' 24/7.</p>
                  </div>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  alwaysOnline ? "bg-emerald-500" : "bg-zinc-700"
                )}>
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    alwaysOnline ? "right-1" : "left-1"
                  )} />
                </div>
              </div>

              <div 
                onClick={() => setGroupsIgnore(!groupsIgnore)}
                className={cn(
                  "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                  groupsIgnore ? "bg-blue-500/5 border-blue-500/30" : "bg-zinc-800/30 border-zinc-800"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-2 rounded-lg", groupsIgnore ? "bg-blue-500/10 text-blue-500" : "bg-zinc-800 text-zinc-500")}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Ignore Groups</p>
                    <p className="text-xs text-zinc-500">Do not process or notify for group messages.</p>
                  </div>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  groupsIgnore ? "bg-blue-500" : "bg-zinc-700"
                )}>
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    groupsIgnore ? "right-1" : "left-1"
                  )} />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button 
                onClick={handleSaveSettings}
                disabled={updateSettings.isPending}
                className="btn-primary"
              >
                {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Settings
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="card space-y-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              Danger Zone
            </h3>
            <p className="text-xs text-zinc-500">Actions here are permanent and cannot be undone.</p>
            
            <button className="w-full flex items-center gap-3 px-4 py-3 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all text-sm font-medium">
              <Power className="w-4 h-4" />
              Restart Instance
            </button>
            
            <button className="w-full flex items-center gap-3 px-4 py-3 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all text-sm font-medium">
              <Trash2 className="w-4 h-4" />
              Delete Instance
            </button>
          </div>

          <div className="card bg-zinc-900/50 border-zinc-800">
            <h3 className="font-bold text-white mb-4">API Credentials</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Instance ID</p>
                <code className="block bg-zinc-800 p-2 rounded text-xs text-emerald-400 break-all">
                  {selectedInstance?.id}
                </code>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Evolution Name</p>
                <code className="block bg-zinc-800 p-2 rounded text-xs text-zinc-300 break-all">
                  {selectedInstance?.name.toLowerCase().replace(/\s+/g, '_')}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
