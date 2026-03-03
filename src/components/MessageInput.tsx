import React, { useState, useRef } from 'react';
import { Send, Paperclip, Smile, Mic, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MessageInputProps {
  onSendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  disabled?: boolean;
}

export function MessageInput({ onSendMessage, isSending, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || isSending || disabled) return;

    const messageText = text;
    setText('');
    try {
      await onSendMessage(messageText);
    } catch (error) {
      setText(messageText); // Restore text on error
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 bg-zinc-900/80 backdrop-blur-md border-t border-zinc-800">
      <div className="max-w-4xl mx-auto flex items-end gap-3">
        <div className="relative">
          <button 
            onClick={() => setShowAttachments(!showAttachments)}
            className="p-3 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all"
            disabled={disabled}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {showAttachments && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-0 mb-4 bg-zinc-800 border border-zinc-700 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 min-w-[160px]"
              >
                <button className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-700 rounded-xl text-sm transition-colors">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  <span>Image</span>
                </button>
                <button className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-700 rounded-xl text-sm transition-colors">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span>Document</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button className="p-3 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all" disabled={disabled}>
          <Smile className="w-5 h-5" />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Select a chat to start messaging" : "Type a message..."}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-none max-h-32"
            disabled={disabled}
          />
        </div>

        {text.trim() ? (
          <button 
            onClick={() => handleSubmit()}
            disabled={isSending || disabled}
            className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        ) : (
          <button className="p-3 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all" disabled={disabled}>
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
