import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Bell } from 'lucide-react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useUsers } from '@/hooks/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type Profile = Tables<'profiles'>;

export const Chat = () => {
  const { profile, signOut, user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showChat, setShowChat] = useState(false);

  const { users, loading: usersLoading, searchUsers, getRecentConversations, setUsers } = useUsers(user?.id);
  const { messages, loading: messagesLoading, sendMessage, typingUsers, sendTypingIndicator, uploading, setOnNewMessage } = useChat(
    profile?.id,
    selectedUserId
  );
  const { permission, requestPermission, sendNotification } = useNotifications();

  // Request notification permission on mount
  useEffect(() => {
    if (permission === 'default') {
      // Show a toast asking for permission
      toast('Enable notifications?', {
        description: 'Get notified when you receive new messages',
        action: {
          label: 'Enable',
          onClick: () => requestPermission(),
        },
        duration: 10000,
      });
    }
  }, [permission, requestPermission]);

  // Set up notification callback
  useEffect(() => {
    setOnNewMessage((message) => {
      const sender = users.find(u => u.id === message.sender_id);
      sendNotification(`New message from @${sender?.username || 'Someone'}`, {
        body: message.text || 'Sent an attachment',
        tag: message.sender_id, // Prevents duplicate notifications from same sender
      });
    });
  }, [setOnNewMessage, users, sendNotification]);

  // Load recent conversations on mount
  useEffect(() => {
    if (profile?.id) {
      getRecentConversations(profile.id);
    }
  }, [profile?.id, getRecentConversations]);

  // Update selected user when selecting
  useEffect(() => {
    if (selectedUserId) {
      const user = users.find((u) => u.id === selectedUserId);
      setSelectedUser(user || null);
    }
  }, [selectedUserId, users]);

  const handleSelectUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setShowChat(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setShowChat(false);
  }, []);

  const handleSearch = useCallback((query: string) => {
    if (query.trim()) {
      searchUsers(query);
    } else if (profile?.id) {
      getRecentConversations(profile.id);
    }
  }, [searchUsers, getRecentConversations, profile?.id]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="h-[100dvh] flex overflow-hidden relative">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />
      <div className="absolute inset-0 scanline opacity-20 pointer-events-none" />

      {/* Desktop layout: Side-by-side */}
      <div className="hidden md:flex w-full h-full relative z-10">
        <ChatSidebar
          currentProfile={profile}
          users={users}
          selectedUserId={selectedUserId}
          onSelectUser={handleSelectUser}
          onSearch={handleSearch}
          onSignOut={handleSignOut}
          loading={usersLoading}
        />
        <div className="flex-1 h-full">
          <ChatWindow
            messages={messages}
            currentProfileId={profile?.id || ''}
            selectedUser={selectedUser}
            onSendMessage={sendMessage}
            onTyping={sendTypingIndicator}
            typingUsers={typingUsers}
            loading={messagesLoading}
            uploading={uploading}
          />
        </div>
      </div>

      {/* Mobile layout: Full screen switching */}
      <div className="md:hidden w-full h-full relative z-10">
        <AnimatePresence initial={false} mode="wait">
          {!showChat ? (
            <motion.div
              key="sidebar"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
            >
              <ChatSidebar
                currentProfile={profile}
                users={users}
                selectedUserId={selectedUserId}
                onSelectUser={handleSelectUser}
                onSearch={handleSearch}
                onSignOut={handleSignOut}
                loading={usersLoading}
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
            >
              <ChatWindow
                messages={messages}
                currentProfileId={profile?.id || ''}
                selectedUser={selectedUser}
                onSendMessage={sendMessage}
                onTyping={sendTypingIndicator}
                typingUsers={typingUsers}
                loading={messagesLoading}
                uploading={uploading}
                onBackClick={handleBackToList}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
