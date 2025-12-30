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
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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
