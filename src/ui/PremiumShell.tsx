import type { ReactNode } from 'react';

interface PremiumShellProps {
  children: ReactNode;
}

function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export default function PremiumShell({ children }: PremiumShellProps) {
  if (window.location.pathname.startsWith('/reset-password')) {
    return <>{children}</>;
  }

  return (
    <div className="cm-reference-shell">
      <aside className="cm-icon-rail" aria-label="Navegación principal">
        <button
          type="button"
          className="cm-rail-logo"
          title="ChatMi"
          aria-label="Ir al chat"
          onClick={() => emit('chatmi:navigate', 'chat')}
        >
          <span className="cm-rail-logo-mark">CM</span>
        </button>

        <div className="cm-rail-group">
          <button
            type="button"
            className="cm-rail-button"
            title="Nuevo chat"
            aria-label="Nuevo chat"
            onClick={() => emit('chatmi:new-chat')}
          >
            <span>✎</span>
          </button>

          <button
            type="button"
            className="cm-rail-button"
            title="Buscar e historial"
            aria-label="Buscar e historial"
            onClick={() => emit('chatmi:history')}
          >
            <span>⌕</span>
          </button>

          <button
            type="button"
            className="cm-rail-button"
            title="Chat"
            aria-label="Chat"
            onClick={() => emit('chatmi:navigate', 'chat')}
          >
            <span>○</span>
          </button>

          <button
            type="button"
            className="cm-rail-button"
            title="Conversación por voz"
            aria-label="Conversación por voz"
            onClick={() => emit('chatmi:voice')}
          >
            <span>◫</span>
          </button>
        </div>

        <div className="cm-rail-spacer" />

        <button
          type="button"
          className="cm-rail-profile"
          title="Mi cuenta"
          aria-label="Mi cuenta"
          onClick={() => emit('chatmi:navigate', 'dashboard')}
        >
          M
        </button>
      </aside>

      <section className="cm-reference-main">
        <header className="cm-reference-topbar">
          <div className="cm-topbar-spacer" />

          <div className="cm-mode-switch" aria-label="Modo">
            <button
              type="button"
              className="is-active"
              onClick={() => emit('chatmi:navigate', 'chat')}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => emit('chatmi:navigate', 'dashboard')}
            >
              Work
            </button>
          </div>

          <div className="cm-top-actions">
            <span className="cm-connection" title="Gemini conectado">
              <span className="cm-connection-dot" />
              IA
            </span>
            <button
              type="button"
              className="cm-top-profile"
              aria-label="Abrir mi cuenta"
              onClick={() => emit('chatmi:navigate', 'dashboard')}
            >
              M
            </button>
          </div>
        </header>

        <main className="cm-reference-stage">
          {children}
        </main>
      </section>
    </div>
  );
}
