import React, { useState, useEffect } from 'react';
import { useInstances, useChats, WhatsAppChat } from '../hooks/useWhatsApp';
import { ChatList } from '../components/ChatList';
import { ChatWindow } from '../components/ChatWindow';
import { Loader2, MessageSquare, Smartphone, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function Messaging() {
  const { data: instances, isLoading: isLoadingInstances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: chats, isLoading: isLoadingChats } = useChats(selectedInstanceId);

  // Auto-select first connected instance
  useEffect(() => {
    if (instances && !selectedInstanceId) {
      const firstConnected = instances.find(i => i.status === 'CONNECTED');
      if (firstConnected) {
        setSelectedInstanceId(firstConnected.id);
      }
    }
  }, [instances, selectedInstanceId]);

  const connectedInstances = instances?.filter(i => i.status === 'CONNECTED') || [];

  if (isLoadingInstances) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-zinc-500">Loading messaging service...</p>
      </div>
    );
  }

  if (connectedInstances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] p-8 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h3 className="text-2xl font-bold text-white">No Connected Instances</h3>
        <p className="text-zinc-400 mt-2 max-w-md mx-auto">
          You need at least one connected WhatsApp instance to use the messaging features. 
          Please go to the Instances page and connect an account.
        </p>
        <a 
          href="/instances" 
          className="btn-primary mt-8"
        >
          <Smartphone className="w-5 h-5" />
          Go to Instances
        </a>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
      {/* Instance Selector Header */}
      <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-bold text-white">Messages</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Instance:</span>
          <select 
            value={selectedInstanceId || ''} 
            onChange={(e) => {
              setSelectedInstanceId(e.target.value);
              setSelectedChat(null);
            }}
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {connectedInstances.map(inst => (
              <option key={inst.id} value={inst.id}>
                {inst.name} ({inst.phoneNumber || 'No Number'})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Chat List */}
        <div className="w-full md:w-80 lg:w-96 flex-shrink-0">
          <ChatList 
            chats={chats || []} 
            selectedChatId={selectedChat?.id || null}
            onSelectChat={setSelectedChat}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        {/* Main Area - Chat Window */}
        <div className="flex-1 hidden md:block">
          <ChatWindow 
            instanceId={selectedInstanceId || ''} 
            chat={selectedChat} 
          />
        </div>
      </div>
    </div>
  );
}
