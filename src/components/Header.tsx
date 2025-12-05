import React from 'react';
import { User } from '../types';

type View = 'chat' | 'dashboard' | 'admin';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  currentView,
  onNavigate,
}) => {
  const isLoggedIn = !!user;
  const isAdmin = Boolean(user && (user as any).isAdmin);

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
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            CM
          </div>
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
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {isLoggedIn && user && (
            <span className="hidden sm:inline text-xs text-gray-400 max-w-[180px] truncate">
              {user.email}
            </span>
          )}

          <NavButton
            active={currentView === 'chat'}
            onClick={() => onNavigate('chat')}
          >
            Chat
          </NavButton>

          {isLoggedIn && (
            <NavButton
              active={currentView === 'dashboard'}
              onClick={() => onNavigate('dashboard')}
            >
              Mi cuenta
            </NavButton>
          )}

          {isAdmin && (
            <NavButton
              active={currentView === 'admin'}
              onClick={() => onNavigate('admin')}
            >
              Admin
            </NavButton>
          )}

          {isLoggedIn ? (
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 transition-colors"
            >
              Cerrar sesión
            </button>
          ) : (
            <NavButton
              active={currentView === 'dashboard'}
              onClick={() => onNavigate('dashboard')}
            >
              Iniciar sesión
            </NavButton>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
