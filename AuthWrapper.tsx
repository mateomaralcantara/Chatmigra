import React, { useState, useEffect, useCallback } from 'react';
import App from './src/App';
import AuthPanel from './src/components/AuthPanel';
import { User, Plan } from './src/types';

interface Session {
  user: User;
  plan: Plan;
}

type InitialView = 'chat' | 'dashboard';

const SESSION_STORAGE_KEY = 'chatmig_session';

const AuthWrapper: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialView, setInitialView] = useState<InitialView>('chat');

  // 🔁 Restaurar sesión al cargar la app
  useEffect(() => {
    try {
      const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);

      if (!storedSession) {
        setIsLoading(false);
        return;
      }

      const parsed = JSON.parse(storedSession) as Session;

      if (parsed?.user?.email) {
        console.log('[AuthWrapper] Sesión restaurada desde localStorage:', parsed);
        setSession(parsed);
        setInitialView('chat'); // quien vuelve entra directo al chat
      } else {
        console.warn('[AuthWrapper] Sesión inválida, limpiando storage');
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {
      console.error('[AuthWrapper] Error parseando sesión desde localStorage:', error);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ Guardar sesión cuando el usuario inicia sesión / se registra
  const handleLoginSuccess = useCallback((user: User, plan: Plan) => {
    const newSession: Session = { user, plan };

    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      console.log('[AuthWrapper] Sesión guardada en localStorage:', newSession);
      setSession(newSession);
      setInitialView('dashboard'); // primer login → mándalo al dashboard/mi cuenta
    } catch (error) {
      console.error('[AuthWrapper] Error guardando sesión en localStorage:', error);
    }
  }, []);

  // 🚪 Logout limpio
  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      console.log('[AuthWrapper] Sesión eliminada de localStorage');
    } catch (error) {
      console.error('[AuthWrapper] Error eliminando sesión de localStorage:', error);
    } finally {
      setSession(null);
      setInitialView('chat');
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 animate-spin text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="mt-4 text-lg font-medium text-gray-700 dark:text-gray-300">
            Cargando sesión...
          </p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <App
        user={session.user}
        plan={session.plan}
        onLogout={handleLogout}
        initialView={initialView}
      />
    );
  }

  return <AuthPanel onLoginSuccess={handleLoginSuccess} />;
};

export default AuthWrapper;
