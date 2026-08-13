import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthContext: onAuthStateChange event:', event);
      if (event === 'INITIAL_SESSION') return; // Handled by initializeAuth
      
      if (!mounted) return;

      // Tarayıcı sekmesi değiştirildiğinde veya token yenilendiğinde gereksiz yükleme ekranını engelle
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.user && user?.id === session.user.id) {
        setUser(session.user);
        return; // Profili tekrar çekmeye ve loading ekranı göstermeye gerek yok
      }

      setLoading(true);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('AuthContext: User found, fetching profile...');
        await fetchProfile(session.user.id);
      } else {
        console.log('AuthContext: No user in session');
        setProfile(null);
      }
      
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [user?.id]); // Add user?.id to dependencies so the closure has the latest id

  const fetchProfile = async (userId) => {
    console.log('AuthContext: fetchProfile started for', userId);
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Profile fetch timeout (5s)')), 5000)
    );

    try {
      // Race the supabase query against the timeout
      const { data, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        timeoutPromise
      ]);
      
      if (error) {
        if (error.message && error.message.includes('recursion')) {
          console.error('CRITICAL: RLS Policy recursion detected on profiles table.');
        }
        console.warn('AuthContext: Profile fetch issue:', error.message);
        setProfile(prev => prev); // Hata varsa eski profili koru
        return;
      }
      
      console.log('AuthContext: Profile fetched successfully');
      setProfile(data);
    } catch (err) {
      console.error('AuthContext: Error or timeout fetching profile:', err.message || err);
      setProfile(prev => prev); // Timeout durumunda eski profili koru
    }
  };

  const signOut = () => supabase.auth.signOut();

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isMember: profile?.role === 'member',
    isTrainer: profile?.role === 'trainer',
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
