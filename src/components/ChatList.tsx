import React from 'react';
import { WhatsAppChat } from '../types';
import { cn } from '../lib/utils';
import { Search, User, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ChatListProps {
  chats: WhatsAppChat[];
  selectedChatId: string | null;
  onSelectChat: (chat: WhatsAppChat) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ChatList({ 
  chats, 
  selectedChatId, 
  onSelectChat, 
  searchQuery, 
  onSearchChange 
}: ChatListProps) {
  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.id.includes(searchQuery)
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900/50 border-r border-zinc-800">
      <div className="p-4 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input 
            type="text"
            placeholder="Search chats..."
            className="input w-full pl-10 bg-zinc-800/50"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            <p className="text-sm">No chats found</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className={cn(
                "w-full flex items-center gap-4 p-4 transition-all hover:bg-zinc-800/50 border-b border-zinc-800/50 text-left",
                selectedChatId === chat.id && "bg-emerald-500/10 border-l-4 border-l-emerald-500"
              )}
            >
              <div className="relative flex-shrink-0">
                {chat.profilePicUrl ? (
                  <img 
                    src={chat.profilePicUrl} 
                    alt={chat.name} 
                    className="w-12 h-12 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                    {chat.isGroup ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
                  </div>
                )}
                {chat.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-zinc-900">
                    {chat.unreadCount}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-zinc-100 truncate">{chat.name}</h4>
                  {chat.lastMessageTime && (
                    <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                      {formatDistanceToNow(new Date(chat.lastMessageTime), { addSuffix: false })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 truncate">
                  {chat.lastMessage || 'No messages yet'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
