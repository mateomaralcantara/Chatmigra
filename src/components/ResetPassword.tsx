import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setReady(Boolean(session));
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(Boolean(session));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Usa una contraseña de al menos 8 caracteres.');
      return;
    }

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess('Contraseña actualizada. Ya puedes volver a ChatMi.');
      setPassword('');
      setConfirm('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6 text-neutral-900">
      <section className="w-full max-w-md rounded-3xl border border-neutral-200 p-7 shadow-lg">
        <h1 className="text-2xl font-bold">Nueva contraseña</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Define una nueva contraseña para tu cuenta de ChatMi.
        </p>

        {!ready && !success ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Abre esta página desde el enlace de recuperación enviado a tu correo.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nueva contraseña"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5"
            />
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Confirmar contraseña"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5"
            />

            {error && <p className="text-sm text-red-700">{error}</p>}
            {success && <p className="text-sm text-emerald-700">{success}</p>}

            {!success && (
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-neutral-900 px-4 py-3 font-semibold text-white"
              >
                {saving ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            )}
          </form>
        )}

        <a href="/" className="mt-5 inline-block text-sm text-blue-700">
          Volver a ChatMi
        </a>
      </section>
    </main>
  );
};

export default ResetPassword;
