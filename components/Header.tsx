import React from 'react';
import { User } from '../types';

type View = 'chat' | 'dashboard' | 'admin';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  currentView: View;
  onNavigate: (view: View) => void;
}

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

const Header: React.FC<HeaderProps> = ({ user, onLogout, currentView, onNavigate }) => {
  const isAdmin =
    !!ADMIN_EMAIL &&
    !!user &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <header
      className="
        flex items-center justify-between
        p-4
        bg-black
        border-b border-gray-800
        shadow-md
        sticky top-0 z-10
      "
    >
      <div className="flex items-center space-x-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-blue-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12h20M12 2a10 10 0 0 1 10 10c0 3.87-2.14 7.25-5.28 8.94M12 2a10 10 0 0 0-10 10c0 3.87 2.14 7.25-5.28 8.94" />
          <path d="M12 22a10 10 0 0 1-10-10c0-3.87 2.14 7.25-5.28-8.94" />
          <path d="M12 22a10 10 0 0 0 10-10c0-3.87-2.14 7.25-5.28-8.94" />
          <path d="M12 2v20" />
        </svg>
        <h1 className="text-xl font-bold text-gray-100">
          ChatMig <span className="text-blue-500">AI</span>
        </h1>
      </div>

      {user ? (
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-300 hidden sm:block">
            {user.email}
          </span>

          <div className="hidden sm:flex items-center space-x-2">
            <div className="w-px h-5 bg-gray-700" />
            <button
              onClick={() => onNavigate('chat')}
              className={`text-sm font-medium px-2 py-1 rounded-md transition-colors ${
                currentView === 'chat'
                  ? 'text-blue-400 bg-blue-900/40'
                  : 'text-gray-300 hover:text-blue-400'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className={`text-sm font-medium px-2 py-1 rounded-md transition-colors ${
                currentView === 'dashboard'
                  ? 'text-blue-400 bg-blue-900/40'
                  : 'text-gray-300 hover:text-blue-400'
              }`}
            >
              Mi cuenta
            </button>
            {isAdmin && (
              <button
                onClick={() => onNavigate('admin')}
                className={`text-sm font-medium px-2 py-1 rounded-md transition-colors ${
                  currentView === 'admin'
                    ? 'text-blue-400 bg-blue-900/40'
                    : 'text-gray-300 hover:text-blue-400'
                }`}
              >
                Admin
              </button>
            )}
          </div>

          <div className="w-px h-5 bg-gray-700" />
          <button
            onClick={onLogout}
            className="text-sm font-medium text-blue-400 hover:underline focus:outline-none"
          >
            Cerrar sesión
          </button>
        </div>
      ) : (
        <div className="text-sm text-gray-300">
          Asistente Migratorio
        </div>
      )}
    </header>
  );
};

export default Header;
