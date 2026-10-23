import React, { useCallback, useEffect, useState } from 'react';
import App from './App';
import AuthPanel from './components/AuthPanel';
import { Plan, type User } from './types';
import { supabase } from './services/supabaseClient';

interface SessionCache {
  user: User;
  plan: Plan;
}

type InitialView = 'chat' | 'dashboard';

const SESSION_STORAGE_KEY = 'chatmig_session';

const normalizePlan = (value: unknown): Plan => {
  if (value === Plan.PREMIUM || value === Plan.PRO || value === Plan.FREE) {
    return value;
  }

  return Plan.FREE;
};

function readSessionCache(): SessionCache | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SessionCache>;

    if (!parsed.user?.email || !parsed.plan) return null;

    return {
      user: parsed.user,
      plan: normalizePlan(parsed.plan),
    };
  } catch {
    return null;
  }
}

function writeSessionCache(value: SessionCache | null): void {
  try {
    if (!value) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // La sesión real es Supabase; localStorage es solo cache de UX.
  }
}

const AuthWrapper: React.FC = () => {
  const [session, setSession] = useState<SessionCache | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialView, setInitialView] = useState<InitialView>('chat');

  useEffect(() => {
    let active = true;

    const restore = async () => {
      try {
        const cached = readSessionCache();
        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session?.user) {
          writeSessionCache(null);
          if (active) setSession(null);
          return;
        }

        const authUser = data.session.user;
        const email = authUser.email;

        if (!email) {
          writeSessionCache(null);
          if (active) setSession(null);
          return;
        }

        const metadata = authUser.user_metadata as {
          first_name?: unknown;
          last_name?: unknown;
        };

        const user: User = {
          email,
          firstName:
            typeof metadata.first_name === 'string'
              ? metadata.first_name
              : cached?.user.email === email
                ? cached.user.firstName
                : 'Usuario',
          lastName:
            typeof metadata.last_name === 'string'
              ? metadata.last_name
              : cached?.user.email === email
                ? cached.user.lastName
                : '',
        };

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('plan,status')
          .eq('user_email', email)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const plan = normalizePlan(
          subscription?.plan ??
            (cached?.user.email === email ? cached.plan : Plan.FREE),
        );

        const restored: SessionCache = { user, plan };
        writeSessionCache(restored);

        if (active) {
          setSession(restored);
          setInitialView('chat');
        }
      } catch (error) {
        console.error('[AuthWrapper] No se pudo restaurar la sesión:', error);
        writeSessionCache(null);
        if (active) setSession(null);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void restore();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        writeSessionCache(null);
        if (active) {
          setSession(null);
          setInitialView('chat');
        }
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = useCallback((user: User, plan: Plan) => {
    const nextSession: SessionCache = {
      user,
      plan: normalizePlan(plan),
    };

    writeSessionCache(nextSession);
    setSession(nextSession);
    setInitialView('dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.warn('[AuthWrapper] Supabase signOut:', error.message);
      }
    } catch (error) {
      console.error('[AuthWrapper] Error cerrando sesión:', error);
    } finally {
      writeSessionCache(null);
      setSession(null);
      setInitialView('chat');
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center text-slate-200">
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500"
            aria-label="Cargando"
          />
          <p className="mt-4 text-sm font-medium">Validando sesión…</p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <App
        user={session.user}
        plan={session.plan}
        onLogout={() => {
          void handleLogout();
        }}
        initialView={initialView}
      />
    );
  }

  return <AuthPanel onLoginSuccess={handleLoginSuccess} />;
};

export default AuthWrapper;
