import React, { useState, useEffect } from 'react';
import App from './App';
import AuthPanel from './components/AuthPanel';
import { User, Plan } from './types';

interface Session {
  user: User;
  plan: Plan;
}

const SESSION_STORAGE_KEY = 'chatmig_session';

const AuthWrapper: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // DEVELOPMENT BYPASS: Automatically log in a test user to skip the subscription panel.
    // This allows direct access to the main application for development and testing.
    // To re-enable the full authentication and PayPal flow, comment out this block
    // and uncomment the original logic below.
    const devUser: User = { email: 'dev-user@chatmig.ai', firstName: 'Developer', lastName: 'Mode' };
    setSession({ user: devUser, plan: Plan.PREMIUM });
    setIsLoading(false);

    /*
    // --- Original Authentication Logic ---
    try {
      const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (storedSession) {
        setSession(JSON.parse(storedSession));
      }
    } catch (error) {
      console.error("Failed to parse session from localStorage", error);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
    */
  }, []);

  const handleLoginSuccess = (user: User, plan: Plan) => {
    const newSession = { user, plan };
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      setSession(newSession);
    } catch (error) {
      console.error("Failed to save session to localStorage", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-lg font-medium text-gray-700 dark:text-gray-300">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (session) {
    return <App user={session.user} plan={session.plan} onLogout={handleLogout} />;
  }

  return <AuthPanel onLoginSuccess={handleLoginSuccess} />;
};

export default AuthWrapper;