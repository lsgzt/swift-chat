import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { RealtimeChannel } from '@supabase/supabase-js';

type Message = Tables<'messages'>;
type Profile = Tables<'profiles'>;

interface MessageWithSender extends Message {
  sender?: Profile;
}

interface SendMessageOptions {
  text?: string;
  file?: File;
}

export const useChat = (currentProfileId: string | undefined, selectedUserId: string | undefined) => {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const onNewMessageRef = useRef<((message: Message) => void) | null>(null);

  // Allow external callback for new messages (for notifications)
  const setOnNewMessage = useCallback((callback: (message: Message) => void) => {
    onNewMessageRef.current = callback;
  }, []);

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

  // Upload file
  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    if (!currentProfileId) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${currentProfileId}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return null;
    }

    const { data } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(fileName);

    return {
      url: data.publicUrl,
      name: file.name,
      type: file.type,
    };
  };

  // Send message
  const sendMessage = useCallback(async (textOrOptions: string | SendMessageOptions) => {
    if (!currentProfileId || !selectedUserId) return;

    let text = '';
    let file: File | undefined;

    if (typeof textOrOptions === 'string') {
      text = textOrOptions;
    } else {
      text = textOrOptions.text || '';
      file = textOrOptions.file;
    }

    if (!text.trim() && !file) return;

    setUploading(!!file);

    let fileData: { url: string; name: string; type: string } | null = null;
    if (file) {
      fileData = await uploadFile(file);
      if (!fileData && !text.trim()) {
        setUploading(false);
        return; // Failed to upload and no text
      }
    }

    const newMessage: any = {
      sender_id: currentProfileId,
      receiver_id: selectedUserId,
      text: text.trim() || (fileData ? '' : ''),
    };

    if (fileData) {
      newMessage.file_url = fileData.url;
      newMessage.file_name = fileData.name;
      newMessage.file_type = fileData.type;
    }

    // Optimistic update
    const optimisticMessage: MessageWithSender = {
      id: `temp-${Date.now()}`,
      sender_id: currentProfileId,
      receiver_id: selectedUserId,
      text: newMessage.text,
      seen: false,
      created_at: new Date().toISOString(),
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setUploading(false);

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

            // Trigger notification callback
            if (newMsg.sender_id !== currentProfileId && onNewMessageRef.current) {
              onNewMessageRef.current(newMsg);
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
    uploading,
    setOnNewMessage,
  };
};
