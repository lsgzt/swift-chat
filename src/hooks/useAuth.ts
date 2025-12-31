import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!error && data) {
      setProfile(data);
    }
    return data;
  }, []);

  // Update online status
  const updateOnlineStatus = useCallback(async (userId: string, online: boolean) => {
    await supabase
      .from('profiles')
      .update({ online, last_seen: new Date().toISOString() })
      .eq('user_id', userId);
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer Supabase calls with setTimeout
          setTimeout(() => {
            fetchProfile(session.user.id);
            updateOnlineStatus(session.user.id, true);
          }, 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        updateOnlineStatus(session.user.id, true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, updateOnlineStatus]);

  // Handle visibility change and beforeunload for proper offline status
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Use sendBeacon for reliable offline update
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user.id}`;
        const body = JSON.stringify({ online: false, last_seen: new Date().toISOString() });
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else if (document.visibilityState === 'visible') {
        updateOnlineStatus(user.id, true);
      }
    };

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline update on page close
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user.id}`;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Prefer': 'return=minimal'
      };
      
      fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ online: false, last_seen: new Date().toISOString() }),
        keepalive: true
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Heartbeat to keep online status fresh
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateOnlineStatus(user.id, true);
      }
    }, 30000); // Every 30 seconds

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(heartbeat);
    };
  }, [user, updateOnlineStatus]);

  const signUp = async (username: string, password: string) => {
    // Use username as a fake email for auth
    const email = `${username.toLowerCase()}@chat.local`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      return { error };
    }

    // Create profile with username
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: data.user.id,
          username: username.toLowerCase(),
          online: true,
        });

      if (profileError) {
        // If username taken
        if (profileError.code === '23505') {
          return { error: { message: 'Username already taken' } };
        }
        return { error: profileError };
      }
    }

    return { data, error: null };
  };

  const signIn = async (username: string, password: string) => {
    const email = `${username.toLowerCase()}@chat.local`;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: { message: 'Invalid username or password' } };
      }
      return { error };
    }

    // Set online status
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ online: true, last_seen: new Date().toISOString() })
        .eq('user_id', data.user.id);
    }

    return { data, error: null };
  };

  const signOut = async () => {
    // Set offline status
    if (user) {
      await supabase
        .from('profiles')
        .update({ online: false, last_seen: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    fetchProfile,
  };
};
