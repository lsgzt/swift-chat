import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { RealtimeChannel } from '@supabase/supabase-js';

type Message = Tables<'messages'>;
type Profile = Tables<'profiles'>;

interface MessageWithSender extends Message {
  sender?: Profile;
}

export const useChat = (currentProfileId: string | undefined, selectedUserId: string | undefined) => {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);

  // Load chat history
  const loadMessages = useCallback(async () => {
    if (!currentProfileId || !selectedUserId) return;
    
    setLoading(true);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .or(
        `and(sender_id.eq.${currentProfileId},receiver_id.eq.${selectedUserId}),and(sender_id.eq.${selectedUserId},receiver_id.eq.${currentProfileId})`
      )
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data as MessageWithSender[]);
    }
    setLoading(false);
  }, [currentProfileId, selectedUserId]);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!currentProfileId || !selectedUserId || !text.trim()) return;

    const newMessage = {
      sender_id: currentProfileId,
      receiver_id: selectedUserId,
      text: text.trim(),
    };

    // Optimistic update
    const optimisticMessage: MessageWithSender = {
      id: `temp-${Date.now()}`,
      ...newMessage,
      seen: false,
      created_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, optimisticMessage]);

    const { error } = await supabase
      .from('messages')
      .insert(newMessage);

    if (error) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      console.error('Error sending message:', error);
    }
  }, [currentProfileId, selectedUserId]);

  // Mark messages as seen
  const markAsSeen = useCallback(async () => {
    if (!currentProfileId || !selectedUserId) return;

    await supabase
      .from('messages')
      .update({ seen: true })
      .eq('sender_id', selectedUserId)
      .eq('receiver_id', currentProfileId)
      .eq('seen', false);
  }, [currentProfileId, selectedUserId]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!currentProfileId || !selectedUserId) return;

    loadMessages();
    markAsSeen();

    // Subscribe to new messages
    channelRef.current = supabase
      .channel(`messages:${currentProfileId}:${selectedUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Only add if it's for this conversation
          if (
            (newMsg.sender_id === currentProfileId && newMsg.receiver_id === selectedUserId) ||
            (newMsg.sender_id === selectedUserId && newMsg.receiver_id === currentProfileId)
          ) {
            setMessages(prev => {
              // Avoid duplicates (from optimistic update)
              if (prev.some(m => m.id === newMsg.id)) return prev;
              // Remove temp message if exists
              const filtered = prev.filter(m => !m.id.startsWith('temp-'));
              return [...filtered, newMsg];
            });
            
            // Mark as seen if we're the receiver
            if (newMsg.receiver_id === currentProfileId) {
              markAsSeen();
            }
          }
        }
      )
      .subscribe();

    // Typing indicator channel using presence
    typingChannelRef.current = supabase
      .channel(`typing:${[currentProfileId, selectedUserId].sort().join(':')}`)
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannelRef.current?.presenceState() || {};
        const typing = new Set<string>();
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.isTyping && p.profileId !== currentProfileId) {
              typing.add(p.profileId);
            }
          });
        });
        setTypingUsers(typing);
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
      typingChannelRef.current?.unsubscribe();
    };
  }, [currentProfileId, selectedUserId, loadMessages, markAsSeen]);

  // Send typing indicator
  const sendTypingIndicator = useCallback(async (isTyping: boolean) => {
    if (!currentProfileId || !typingChannelRef.current) return;

    await typingChannelRef.current.track({
      profileId: currentProfileId,
      isTyping,
    });
  }, [currentProfileId]);

  return {
    messages,
    loading,
    sendMessage,
    typingUsers,
    sendTypingIndicator,
  };
};
