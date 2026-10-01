import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './auth';

const isActivePremium = (subscription) =>
  subscription?.plan === 'premium' &&
  (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());

// Restores the Supabase session on load and keeps the signed-in user's profile and
// plan in one place, so every page and route guard reads the same state.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined while restoring
  // Which user the profile/plan below belong to; differs from the session while loading
  const [account, setAccount] = useState({ userId: null, profile: null, subscription: null, hasPremium: false });
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!userId) return;
    const [profileResult, subscriptionResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    const subscription = subscriptionResult.data ?? null;
    setAccount({ userId, profile: profileResult.data ?? null, subscription, hasPremium: isActivePremium(subscription) });
  }, [userId]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  const current = account.userId === userId;
  const value = {
    session,
    user: session?.user ?? null,
    profile: current ? account.profile : null,
    subscription: current ? account.subscription : null,
    hasPremium: current && account.hasPremium,
    loading: session === undefined || (userId !== null && !current),
    refreshAccount,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
