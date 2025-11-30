// src/AdminApp.tsx
import React, { useState } from 'react';
import { supabase } from './services/supabaseClient';
import AdminDashboard from './components/AdminDashboard';
import { User } from './types';

const ADMIN_EMAIL = 'madmin@chatmig.com';

const AdminApp: React.FC = () => {
  // Usuario solo para el panel admin
  const [adminUser, setAdminUser] = useState<User | null>(null);

  // Estado del formulario
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        console.error('[AdminApp] signIn error:', error);
        setError('Correo o contraseña incorrectos.');
        return;
      }

      const logged = data.user;
      const loggedEmail = (logged?.email || '').toLowerCase();

      if (loggedEmail !== ADMIN_EMAIL.toLowerCase()) {
        setError('Solo el administrador puede entrar aquí.');
        await supabase.auth.signOut(); // por si entró otro usuario
        return;
      }

      // User local solo para AdminDashboard
      setAdminUser({
        email: logged.email!,
        firstName: logged.user_metadata?.first_name || 'Admin',
        lastName: logged.user_metadata?.last_name || '',
      });
    } catch (err) {
      console.error('[AdminApp] login fatal error:', err);
      setError('Error al iniciar sesión como admin.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error al cerrar sesión de admin:', err);
    } finally {
      // Volvemos al formulario limpio SIEMPRE
      setAdminUser(null);
      setEmail('');
      setPassword('');
      setError('');
      setLoading(false);
    }
  };

  // 🔐 Si NO hay adminUser → mostrar siempre login
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-neutral-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold mb-2 text-center">
            Panel Administrador
          </h1>
          <p className="text-sm text-gray-400 mb-6 text-center">
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
                autoComplete="off"
                className="w-full px-3 py-2 rounded-md bg-black border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="madmin@chatmi.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded-md bg-black border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-md disabled:bg-blue-900/60"
            >
              {loading ? 'Entrando...' : 'Entrar al panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ✅ Ya autenticado como admin → dashboard
  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col">
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Panel de Administración</h1>
          <p className="text-xs text-gray-500">
            Solo para el dueño de ChatMig.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
        >
          Salir del panel
        </button>
      </div>

      <div className="flex-1">
        <AdminDashboard user={adminUser} />
      </div>
    </div>
  );
};

export default AdminApp;
