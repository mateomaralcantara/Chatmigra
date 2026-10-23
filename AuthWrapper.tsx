import React, { useCallback, useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import App from './src/App';
import AuthPanel from './src/components/AuthPanel';
import { supabase } from './src/services/supabaseClient';
import { Plan, type User } from './src/types';

interface AppSession {
  user: User;
  plan: Plan;
}

function toAppUser(user: SupabaseUser): User {
  const metadata = user.user_metadata as
    | { first_name?: string; last_name?: string }
    | undefined;

  return {
    id: user.id,
    email: user.email || '',
    firstName: metadata?.first_name || 'Usuario',
    lastName: metadata?.last_name || '',
  };
}

async function resolvePlan(userId: string): Promise<Plan> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) return Plan.FREE;

    if (data.plan === 'premium') return Plan.PREMIUM;
    if (data.plan === 'pro') return Plan.PRO;

    return Plan.FREE;
  } catch {
    return Plan.FREE;
  }
}

const AuthWrapper: React.FC = () => {
  const [session, setSession] = useState<AppSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrate = useCallback(async (authUser: SupabaseUser | null) => {
    if (!authUser?.email) {
      setSession(null);
      return;
    }

    const plan = await resolvePlan(authUser.id);
    setSession({
      user: toAppUser(authUser),
      plan,
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();

        if (mounted) {
          await hydrate(authSession?.user ?? null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      void hydrate(authSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [hydrate]);

  const handleLoginSuccess = useCallback((user: User, plan: Plan) => {
    setSession({ user, plan });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-neutral-700">
        <p className="text-sm">Cargando ChatMi…</p>
      </div>
    );
  }

  if (!session) {
    return <AuthPanel onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <App
      user={session.user}
      plan={session.plan}
      onLogout={() => {
        void handleLogout();
      }}
      initialView="chat"
    />
  );
};

export default AuthWrapper;
