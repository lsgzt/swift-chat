import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

export const useUsers = (currentUserId: string | undefined) => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  // Search users by username
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || !currentUserId) return;
    
    setLoading(true);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${query}%`)
      .neq('user_id', currentUserId)
      .limit(10);

    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  }, [currentUserId]);

  // Get recent conversations
  const getRecentConversations = useCallback(async (profileId: string) => {
    if (!profileId) return;
    
    setLoading(true);

    // Get unique users from messages
    const { data: sentMessages } = await supabase
      .from('messages')
      .select('receiver_id')
      .eq('sender_id', profileId);

    const { data: receivedMessages } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', profileId);

    const userIds = new Set<string>();
    sentMessages?.forEach(m => userIds.add(m.receiver_id));
    receivedMessages?.forEach(m => userIds.add(m.sender_id));

    if (userIds.size === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(userIds));

    if (!error && profiles) {
      setUsers(profiles);
    }
    setLoading(false);
  }, []);

  // Subscribe to profile updates (online status)
  useEffect(() => {
    const channel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const updated = payload.new as Profile;
          setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return {
    users,
    loading,
    searchUsers,
    getRecentConversations,
    setUsers,
  };
};
