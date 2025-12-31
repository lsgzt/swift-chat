import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, ChevronDown, Paperclip, X, FileIcon, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tables } from '@/integrations/supabase/types';
import { format, isToday, isYesterday } from 'date-fns';
import { linkifyText } from '@/lib/linkify';

type Message = Tables<'messages'>;
type Profile = Tables<'profiles'>;

interface MessageWithSender extends Message {
  sender?: Profile;
}

interface ChatWindowProps {
  messages: MessageWithSender[];
  currentProfileId: string;
  selectedUser: Profile | null;
  onSendMessage: (options: string | { text?: string; file?: File }) => void;
  onTyping: (isTyping: boolean) => void;
  typingUsers: Set<string>;
  loading: boolean;
  uploading?: boolean;
  onBackClick?: () => void;
}

export const ChatWindow = ({
  messages,
  currentProfileId,
  selectedUser,
  onSendMessage,
  onTyping,
  typingUsers,
  loading,
  uploading = false,
  onBackClick,
}: ChatWindowProps) => {
  const [newMessage, setNewMessage] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle scroll position for button visibility
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
  };

  // Handle typing indicator with debounce
  const handleInputChange = (value: string) => {
    setNewMessage(value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (value.trim()) {
      onTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    } else {
      onTyping(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleSend = () => {
    if (!newMessage.trim() && !selectedFile) return;
    
    if (selectedFile) {
      onSendMessage({ text: newMessage, file: selectedFile });
    } else {
      onSendMessage(newMessage);
    }
    
    setNewMessage('');
    clearFile();
    onTyping(false);
    
    // Keep focus on input for mobile
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, 'HH:mm')}`;
    }
    return format(date, 'MMM d, HH:mm');
  };

  const isImageFile = (type: string | null) => type?.startsWith('image/');

  const isTyping = typingUsers.size > 0;

  if (!selectedUser) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center">
          <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground">
            Select a user to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header - fixed at top */}
      <div className="shrink-0 p-4 border-b border-border/50 glass flex items-center gap-3 safe-area-top">
        {onBackClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBackClick}
            className="md:hidden shrink-0"
          >
            <ChevronDown className="w-5 h-5 rotate-90" />
          </Button>
        )}
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border/50">
            <span className="text-sm font-semibold text-foreground">
              {selectedUser.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
              selectedUser.online ? 'bg-primary animate-pulse-glow' : 'bg-muted-foreground'
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate">@{selectedUser.username}</p>
          <p className="text-xs text-muted-foreground">
            {selectedUser.online ? 'Online' : 'Offline'}
          </p>
        </div>
      </div>

      {/* Messages - scrollable area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : ''}`}>
                <div className={`max-w-[70%] p-3 rounded-lg animate-pulse ${
                  i % 2 === 0 ? 'bg-primary/20' : 'bg-secondary'
                }`}>
                  <div className="h-4 bg-muted rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message, index) => {
              const isOwn = message.sender_id === currentProfileId;
              const showTimestamp = index === 0 || 
                new Date(message.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() > 300000;

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                    {showTimestamp && (
                      <p className={`text-xs text-muted-foreground mb-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                        {formatMessageTime(message.created_at)}
                      </p>
                    )}
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-secondary text-secondary-foreground rounded-bl-md'
                      }`}
                    >
                      {/* File attachment */}
                      {message.file_url && (
                        <div className="mb-2">
                          {isImageFile(message.file_type) ? (
                            <a href={message.file_url} target="_blank" rel="noopener noreferrer">
                              <img 
                                src={message.file_url} 
                                alt={message.file_name || 'Image'} 
                                className="max-w-full rounded-lg max-h-60 object-cover"
                              />
                            </a>
                          ) : (
                            <a 
                              href={message.file_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 bg-background/20 rounded-lg hover:bg-background/30"
                            >
                              <FileIcon className="w-5 h-5 shrink-0" />
                              <span className="text-sm truncate">{message.file_name || 'File'}</span>
                            </a>
                          )}
                        </div>
                      )}
                      {message.text && (
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {linkifyText(message.text)}
                        </p>
                      )}
                    </div>
                    {isOwn && (
                      <p className="text-xs text-muted-foreground mt-0.5 text-right">
                        {message.seen ? '✓✓' : '✓'}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2"
            >
              <div className="bg-secondary px-4 py-2 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: '200ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: '400ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-28 right-6 p-2 rounded-full bg-primary text-primary-foreground shadow-lg glow z-10"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* File preview */}
      <AnimatePresence>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="shrink-0 px-4 py-2 border-t border-border/50 glass"
          >
            <div className="flex items-center gap-2 p-2 bg-secondary rounded-lg">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-12 h-12 object-cover rounded" />
              ) : (
                <FileIcon className="w-8 h-8 text-muted-foreground" />
              )}
              <span className="flex-1 text-sm truncate">{selectedFile.name}</span>
              <Button variant="ghost" size="icon" onClick={clearFile} className="shrink-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area - fixed at bottom */}
      <div className="shrink-0 p-4 border-t border-border/50 glass safe-area-bottom">
        <div className="flex gap-2 items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-input border-border/50 focus:border-primary"
            autoComplete="off"
          />
          <Button
            onClick={handleSend}
            disabled={(!newMessage.trim() && !selectedFile) || uploading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 glow shrink-0"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
