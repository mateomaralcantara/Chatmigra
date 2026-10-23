import React, { useCallback, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Plan, type User } from '../types';

interface AuthPanelProps {
  onLoginSuccess: (user: User, plan: Plan) => void;
}

function appUserFromAuth(authUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): User {
  const metadata = authUser.user_metadata || {};

  return {
    id: authUser.id,
    email: authUser.email || '',
    firstName:
      typeof metadata.first_name === 'string' ? metadata.first_name : 'Usuario',
    lastName:
      typeof metadata.last_name === 'string' ? metadata.last_name : '',
  };
}

async function resolvePlan(
  userId: string,
  userEmail: string,
): Promise<Plan> {
  try {
    const byId = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!byId.error && byId.data) {
      if (byId.data.plan === 'premium') return Plan.PREMIUM;
      if (byId.data.plan === 'pro') return Plan.PRO;
      return Plan.FREE;
    }

    const byEmail = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_email', userEmail)
      .eq('status', 'active')
      .limit(1);

    const legacy = Array.isArray(byEmail.data) ? byEmail.data[0] : null;

    if (legacy?.plan === 'premium') return Plan.PREMIUM;
    if (legacy?.plan === 'pro') return Plan.PRO;
    return Plan.FREE;
  } catch {
    return Plan.FREE;
  }
}

const AuthPanel: React.FC<AuthPanelProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const clearMessages = () => {
    setError('');
    setInfo('');
  };

  const handleForgotPassword = useCallback(async () => {
    const target = email.trim();

    if (!target) {
      setError('Escribe tu correo electrónico.');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        target,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setInfo('Te enviamos un enlace para restablecer tu contraseña.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearMessages();

      if (mode === 'forgot') {
        await handleForgotPassword();
        return;
      }

      const cleanEmail = email.trim().toLowerCase();

      if (!cleanEmail || !password) {
        setError('Completa correo y contraseña.');
        return;
      }

      if (mode === 'signup' && (!firstName.trim() || !lastName.trim())) {
        setError('Completa tu nombre y apellido.');
        return;
      }

      setLoading(true);

      try {
        if (mode === 'signup') {
          const { data, error: signUpError } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
              },
              emailRedirectTo: window.location.origin,
            },
          });

          if (signUpError) {
            setError(signUpError.message);
            return;
          }

          if (data.session && data.user) {
            onLoginSuccess(appUserFromAuth(data.user), Plan.FREE);
            return;
          }

          setMode('login');
          setPassword('');
          setInfo(
            'Cuenta creada. Confirma tu correo y luego inicia sesión. El plan gratuito incluye 3,000 tokens totales.',
          );
          return;
        }

        const { data, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (loginError || !data.user) {
          setError(loginError?.message || 'No se pudo iniciar sesión.');
          return;
        }

        const plan = await resolvePlan(
          data.user.id,
          data.user.email || cleanEmail,
        );
        onLoginSuccess(appUserFromAuth(data.user), plan);
      } catch (caught) {
        console.error('[AuthPanel]', caught);
        setError('Ocurrió un error. Intenta nuevamente.');
      } finally {
        setLoading(false);
      }
    },
    [
      mode,
      email,
      password,
      firstName,
      lastName,
      handleForgotPassword,
      onLoginSuccess,
    ],
  );

  return (
    <main className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-7 shadow-[0_18px_60px_rgba(0,0,0,.08)]">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-neutral-900 text-sm font-extrabold text-white">
            CM
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ChatMi</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Asistente migratorio con inteligencia artificial
          </p>
        </div>

        <h2 className="mb-5 text-center text-lg font-semibold">
          {mode === 'login'
            ? 'Inicia sesión'
            : mode === 'signup'
              ? 'Crea tu cuenta'
              : 'Recupera tu contraseña'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="Nombre"
                className="rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-blue-500"
                required
              />
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Apellido"
                className="rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-blue-500"
                required
              />
            </div>
          )}

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Correo electrónico"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-blue-500"
            required
          />

          {mode !== 'forgot' && (
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-blue-500"
              required
            />
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {info && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? 'Procesando…'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'signup'
                  ? 'Crear cuenta'
                  : 'Enviar enlace'}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
          {mode !== 'login' && (
            <button
              type="button"
              className="text-blue-700"
              onClick={() => {
                clearMessages();
                setMode('login');
              }}
            >
              Iniciar sesión
            </button>
          )}

          {mode !== 'signup' && (
            <button
              type="button"
              className="text-blue-700"
              onClick={() => {
                clearMessages();
                setMode('signup');
              }}
            >
              Crear cuenta
            </button>
          )}

          {mode !== 'forgot' && (
            <button
              type="button"
              className="text-neutral-600"
              onClick={() => {
                clearMessages();
                setMode('forgot');
              }}
            >
              Olvidé mi contraseña
            </button>
          )}
        </div>
      </section>
    </main>
  );
};

export default AuthPanel;
