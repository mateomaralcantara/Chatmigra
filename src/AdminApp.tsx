// src/AdminApp.tsx
import React, { useState, useCallback } from 'react';
import { supabase } from './services/supabaseClient';
import { runChatStream } from './services/geminiService';
import AdminDashboard from './components/AdminDashboard';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { User, Plan, ChatMessage } from './types';

const ADMIN_EMAIL = 'madmin@chatmig.com';

const INITIAL_ADMIN_MESSAGE: ChatMessage = {
  role: 'model',
  content:
    'Hola 👋 Soy ChatMig en modo *admin test*. Aquí puedes probar respuestas como si fueras un usuario premium.',
};

const AdminApp: React.FC = () => {
  // usuario admin
  const [adminUser, setAdminUser] = useState<User | null>(null);

  // login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // vista del panel
  const [view, setView] = useState<'dashboard' | 'chat'>('dashboard');

  // estado del chat de prueba
  const [messages, setMessages] = useState<ChatMessage[]>([
    INITIAL_ADMIN_MESSAGE,
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  /* ---------- LOGIN ADMIN ---------- */
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (authLoading) return;

    setAuthError(null);
    setAuthLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        console.error('[AdminApp] signIn error:', error);
        setAuthError('Correo o contraseña incorrectos.');
        return;
      }

      const logged = data.user;
      const loggedEmail = (logged?.email || '').toLowerCase();

      if (loggedEmail !== ADMIN_EMAIL.toLowerCase()) {
        setAuthError('Solo el administrador puede entrar aquí.');
        await supabase.auth.signOut();
        return;
      }

      setAdminUser({
        email: logged!.email!,
        firstName: (logged!.user_metadata as any)?.first_name || 'Admin',
        lastName: (logged!.user_metadata as any)?.last_name || '',
      });

      setView('dashboard');
    } catch (err) {
      console.error('[AdminApp] login fatal error:', err);
      setAuthError('Error al iniciar sesión como admin.');
    } finally {
      setAuthLoading(false);
    }
  };

  /* ---------- LOGOUT ---------- */
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error al cerrar sesión de admin:', err);
    } finally {
      // limpiar todo
      setAdminUser(null);
      setEmail('');
      setPassword('');
      setAuthError(null);
      setAuthLoading(false);
      setView('dashboard');
      setMessages([INITIAL_ADMIN_MESSAGE]);
      setChatError(null);
      setChatLoading(false);
    }
  };

  /* ---------- CHAT DE PRUEBA (ADMIN) ---------- */
  const handleSendAdminMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || chatLoading) return;

      setChatError(null);
      setChatLoading(true);

      const newUserMessage: ChatMessage = { role: 'user', content: trimmed };

      // usar función para evitar estado “stale”
      setMessages(prevHistory => {
        const history = [...prevHistory, newUserMessage];

        (async () => {
          try {
            // placeholder del modelo
            setMessages(prev => [...prev, { role: 'model', content: '' }]);

            const stream = await runChatStream(history, Plan.PREMIUM);
            let full = '';

            for await (const chunk of stream as any) {
              let chunkText = '';
              if (typeof chunk.text === 'function') {
                chunkText = chunk.text();
              } else if (typeof chunk.text === 'string') {
                chunkText = chunk.text;
              }

              if (chunkText) {
                full += chunkText;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === 'model') {
                    const updated: ChatMessage = { ...last, content: full };
                    return [...prev.slice(0, -1), updated];
                  }
                  return prev;
                });
              }
            }

            if (!full) {
              // si no respondió nada, limpiamos el placeholder
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'model' && !last.content) {
                  return prev.slice(0, -1);
                }
                return prev;
              });
            }
          } catch (err: any) {
            console.error('[AdminApp] chat error:', err);
            const msg =
              err instanceof Error
                ? err.message
                : 'Error inesperado en el chat.';
            setChatError(`Ocurrió un error: ${msg}`);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'model' && !last.content) {
                return prev.slice(0, -1);
              }
              return prev;
            });
          } finally {
            setChatLoading(false);
          }
        })();

        return history;
      });
    },
    [chatLoading]
  );

  /* ---------- UI ---------- */

  // sin admin → login
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-neutral-900/80 border border-neutral-800 rounded-xl p-6 shadow-xl">
          <h1 className="text-xl font-semibold mb-1">Acceso Admin</h1>
          <p className="text-xs text-gray-400 mb-4">
            Acceso exclusivo para el dueño de la plataforma.
          </p>

          <form
            onSubmit={handleLogin}
            className="space-y-4"
            autoComplete="off"
          >
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Correo
              </label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded-md bg-black border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={ADMIN_EMAIL}
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                className="w-full px-3 py-2 rounded-md bg-black border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {authError && (
              <p className="text-xs text-red-400 text-center">{authError}</p>
            )}

            <button
              type="submit"
              disabled={authLoading || !email.trim() || !password}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-md disabled:bg-blue-900/60"
            >
              {authLoading ? 'Entrando...' : 'Entrar al panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // admin logueado → panel + chat
  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Panel de Administración</h1>
          <p className="text-xs text-gray-500">
            Solo para el dueño de ChatMig.
          </p>
          <div className="mt-2 flex gap-2 text-xs sm:text-sm">
            <button
              onClick={() => setView('dashboard')}
              className={`px-3 py-1.5 rounded-md border ${
                view === 'dashboard'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-neutral-900 border-gray-700 text-gray-300 hover:border-blue-500'
              }`}
            >
              Panel
            </button>
            <button
              onClick={() => setView('chat')}
              className={`px-3 py-1.5 rounded-md border ${
                view === 'chat'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-neutral-900 border-gray-700 text-gray-300 hover:border-blue-500'
              }`}
            >
              Chat de prueba
            </button>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      {/* Contenido principal */}
      <div className="flex-1">
        {view === 'dashboard' && <AdminDashboard user={adminUser} />}
        {view === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-64px)]">
            <div className="flex-1">
              <ChatWindow
                messages={messages}
                isLoading={chatLoading}
                plan={Plan.PREMIUM}
                userEmail={adminUser.email}
                onGoToUpgrade={() =>
                  alert(
                    'Estás en modo admin, ya estás probando el modo Premium 😉'
                  )
                }
              />
            </div>
            {chatError && (
              <div className="px-4 py-2 text-center text-red-400 bg-red-900/30">
                {chatError}
              </div>
            )}
            <div className="bg-slate-950/70 border-t border-slate-800">
              <ChatInput
                onSendMessage={handleSendAdminMessage}
                isLoading={chatLoading}
                onToggleVoice={() => {
                  alert(
                    'El chat de prueba admin ahora mismo solo soporta texto. La voz está en la app de usuario normal.'
                  );
                }}
                isVoiceActive={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminApp;
