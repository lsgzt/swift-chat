import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageSquare, LogOut, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tables } from '@/integrations/supabase/types';
import { formatDistanceToNow } from 'date-fns';

type Profile = Tables<'profiles'>;

interface ChatSidebarProps {
  currentProfile: Profile | null;
  users: Profile[];
  selectedUserId: string | undefined;
  onSelectUser: (userId: string) => void;
  onSearch: (query: string) => void;
  onSignOut: () => void;
  loading: boolean;
}

export const ChatSidebar = ({
  currentProfile,
  users,
  selectedUserId,
  onSelectUser,
  onSearch,
  onSignOut,
  loading,
}: ChatSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        setIsSearching(true);
        onSearch(searchQuery);
      } else {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, onSearch]);

  return (
    <div className="w-full md:w-80 h-full flex flex-col border-r border-border/50 glass">
      {/* Header */}
      <div className="p-4 border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="font-semibold text-foreground">
              @{currentProfile?.username}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSignOut}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-input border-border/50 focus:border-primary"
          />
        </div>
      </div>

      {/* Users list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-4 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              {isSearching ? 'No users found' : 'Search for users to start chatting'}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="p-2 space-y-1">
              {users.map((user, index) => (
                <motion.button
                  key={user.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelectUser(user.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                    selectedUserId === user.id
                      ? 'bg-primary/20 border border-primary/30'
                      : 'hover:bg-secondary/50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border/50">
                      <span className="text-sm font-semibold text-foreground">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {/* Online indicator */}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
                        user.online ? 'bg-primary animate-pulse-glow' : 'bg-muted-foreground'
                      }`}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-foreground truncate">
                      @{user.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.online
                        ? 'Online'
                        : user.last_seen
                        ? `Last seen ${formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}`
                        : 'Offline'}
                    </p>
                  </div>

                  {selectedUserId === user.id && (
                    <MessageSquare className="w-4 h-4 text-primary" />
                  )}
                </motion.button>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
