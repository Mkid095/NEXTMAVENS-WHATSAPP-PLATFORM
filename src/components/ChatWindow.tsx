import React, { useEffect, useRef } from 'react';
import { WhatsAppChat, WhatsAppMessage } from '../types';
import { useSendMessage, useMarkRead } from '../hooks/useMessages';
import { useMessages } from '../hooks/useMessages'; // Real-time hook with WebSocket
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Loader2, Phone, Video, MoreVertical, Search, User, Users, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatWindowProps {
  instanceId: string;
  chat: WhatsAppChat | null;
  messages?: WhatsAppMessage[]; // Optional: passed from parent
}

export function ChatWindow({ instanceId, chat, messages: propMessages }: ChatWindowProps) {
  const { data: hookMessages, isLoading } = useMessages(instanceId, chat?.id || null);
  const sendMessage = useSendMessage();
  const markRead = useMarkRead();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use prop messages if provided, otherwise use hook messages
  const messages = propMessages || hookMessages;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (chat?.unreadCount && chat.unreadCount > 0) {
      markRead.mutate({
        instanceId,
        keys: [{ remoteJid: chat.id, fromMe: false }]
      });
    }
  }, [messages, chat, markRead, instanceId]);

  const handleSendMessage = async (text: string) => {
    if (!chat) return;
    await sendMessage.mutateAsync({
      instanceId,
      payload: { chatJid: chat.id, message: text }
    });
  };

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900/30 p-8 text-center">
        <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center mb-6">
          <MessageSquare className="w-12 h-12 text-zinc-600" />
        </div>
        <h3 className="text-2xl font-bold text-zinc-300">Select a chat</h3>
        <p className="text-zinc-500 mt-2 max-w-xs">
          Choose a conversation from the list to start messaging with your contacts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-900/30 relative overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="relative">
            {chat.profilePicUrl ? (
              <img 
                src={chat.profilePicUrl} 
                alt={chat.name} 
                className="w-10 h-10 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                {chat.isGroup ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-zinc-900 rounded-full" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-100">{chat.name}</h4>
            <p className="text-xs text-emerald-500 font-medium">Online</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <Search className="w-5 h-5" />
          </button>
          <button className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <Video className="w-5 h-5" />
          </button>
          <button className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-zinc-500 text-sm">Loading messages...</p>
          </div>
        ) : messages?.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-sm italic">No messages in this chat yet.</p>
          </div>
        ) : (
          messages?.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Message Input */}
      <MessageInput 
        onSendMessage={handleSendMessage} 
        isSending={sendMessage.isPending} 
      />
    </div>
  );
}
