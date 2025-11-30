// src/components/Header.tsx
import React from 'react';
import { User } from '../types';

type View = 'chat' | 'dashboard' | 'admin';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, currentView, onNavigate }) => {
  const isLoggedIn = !!user;

  const NavButton: React.FC<{
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }> = ({ active = false, onClick, children }) => (
    <button
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-md text-sm font-medium',
        'transition-colors',
        active
          ? 'text-blue-400 bg-blue-900/40'
          : 'text-gray-300 hover:text-blue-400 hover:bg-blue-900/20',
      ].join(' ')}
    >
      {children}
    </button>
  );

  return (
    <header className="w-full bg-black border-b border-gray-800 shadow-md sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Logo + título */}
        <div className="flex items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-blue-500 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12h20M12 2a10 10 0 0 1 10 10c0 3.87-2.14 7.25-5.28 8.94M12 2a10 10 0 0 0-10 10c0 3.87-2.14 7.25-5.28 8.94" />
            <path d="M12 22a10 10 0 0 1-10-10c0-3.87 2.14-7.25-5.28-8.94" />
            <path d="M12 22a10 10 0 0 0 10-10c0-3.87-2.14-7.25-5.28-8.94" />
            <path d="M12 2v20" />
          </svg>
          <div className="flex flex-col">
            <h1 className="text-lg sm:text-xl font-bold text-gray-100 leading-tight">
              ChatMig <span className="text-blue-500">AI</span>
            </h1>
            <span className="text-[11px] text-gray-500 sm:text-xs">
              Asistente migratorio 24/7
            </span>
          </div>
        </div>

        {/* Navegación */}
        {!isLoggedIn ? (
          // Usuario nuevo → SOLO Chat + Iniciar sesión
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <NavButton
              active={currentView === 'chat'}
              onClick={() => onNavigate('chat')}
            >
              Chat
            </NavButton>

            <NavButton
              active={currentView === 'dashboard'}
              onClick={() => onNavigate('dashboard')}
            >
              Iniciar sesión
            </NavButton>
          </div>
        ) : (
          // Usuario logueado → SOLO Chat + Cerrar sesión (SIN correo)
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <NavButton
              active={currentView === 'chat'}
              onClick={() => onNavigate('chat')}
            >
              Chat
            </NavButton>

            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
