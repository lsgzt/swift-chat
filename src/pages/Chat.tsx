import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useUsers } from '@/hooks/useUsers';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';

type Profile = Tables<'profiles'>;

export const Chat = () => {
  const { profile, signOut, user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { users, loading: usersLoading, searchUsers, getRecentConversations, setUsers } = useUsers(user?.id);
  const { messages, loading: messagesLoading, sendMessage, typingUsers, sendTypingIndicator } = useChat(
    profile?.id,
    selectedUserId
  );

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
    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
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
    <div className="h-screen flex flex-col md:flex-row overflow-hidden relative">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />
      <div className="absolute inset-0 scanline opacity-20 pointer-events-none" />

      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-card/80 backdrop-blur"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{
          x: sidebarOpen ? 0 : '-100%',
          opacity: sidebarOpen ? 1 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`fixed md:relative inset-y-0 left-0 z-40 md:z-auto ${
          sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none md:pointer-events-auto'
        }`}
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

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Chat window */}
      <div className="flex-1 relative z-10">
        <ChatWindow
          messages={messages}
          currentProfileId={profile?.id || ''}
          selectedUser={selectedUser}
          onSendMessage={sendMessage}
          onTyping={sendTypingIndicator}
          typingUsers={typingUsers}
          loading={messagesLoading}
        />
      </div>
    </div>
  );
};
