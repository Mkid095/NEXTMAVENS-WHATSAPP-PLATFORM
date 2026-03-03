import React from 'react';
import { WhatsAppMessage } from '../hooks/useWhatsApp';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, FileText, Image as ImageIcon, Music, Video } from 'lucide-react';

interface MessageBubbleProps {
  message: WhatsAppMessage;
  key?: any;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isMe = message.fromMe;

  const renderContent = () => {
    switch (message.type) {
      case 'image':
        return (
          <div className="space-y-2">
            <img 
              src={message.mediaUrl} 
              alt="Media" 
              className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
              referrerPolicy="no-referrer"
            />
            {message.body && <p className="text-sm">{message.body}</p>}
          </div>
        );
      case 'video':
        return (
          <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <Video className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Video Message</p>
              <p className="text-xs text-zinc-400">Click to play</p>
            </div>
          </div>
        );
      case 'audio':
        return (
          <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg min-w-[200px]">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <Music className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div className="w-1/3 h-full bg-emerald-500" />
            </div>
          </div>
        );
      case 'document':
        return (
          <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.body || 'Document'}</p>
              <p className="text-xs text-zinc-400">PDF • 2.4 MB</p>
            </div>
          </div>
        );
      default:
        return <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>;
    }
  };

  return (
    <div className={cn(
      "flex w-full mb-4",
      isMe ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2 shadow-sm relative group",
        isMe 
          ? "bg-emerald-600 text-white rounded-tr-none" 
          : "bg-zinc-800 text-zinc-100 rounded-tl-none"
      )}>
        {renderContent()}
        
        <div className={cn(
          "flex items-center gap-1 mt-1 justify-end",
          isMe ? "text-emerald-200" : "text-zinc-500"
        )}>
          <span className="text-[10px]">
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
          {isMe && (
            <CheckCheck className="w-3 h-3" />
          )}
        </div>
      </div>
    </div>
  );
}
