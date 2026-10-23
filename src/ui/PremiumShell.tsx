import type { ReactNode } from 'react';

interface PremiumShellProps {
  children: ReactNode;
}

const emit = (name: string, detail?: unknown): void => {
  window.dispatchEvent(
    new CustomEvent(name, {
      detail,
    }),
  );
};

export default function PremiumShell({
  children,
}: PremiumShellProps) {
  const pathname = window.location.pathname;

  const recoveryMode =
    pathname.startsWith('/reset-password');

  if (recoveryMode) {
    return <>{children}</>;
  }

  return (
    <div className="chatmi-ultimate-shell">
      <aside
        className="chatmi-ultimate-left"
        aria-label="Navegación principal"
      >
        <div className="cm-brand">
          <div className="cm-logo" aria-hidden="true">
            <span className="cm-logo-ring cm-ring-a" />
            <span className="cm-logo-ring cm-ring-b" />
            <span className="cm-logo-core" />
          </div>

          <div className="cm-brand-copy">
            <strong>ChatMi</strong>
            <span>Inteligencia personal</span>
          </div>

          <button
            className="cm-square-button"
            type="button"
            aria-label="Opciones"
          >
            ◫
          </button>
        </div>

        <button
          type="button"
          className="cm-new-chat"
          onClick={() => emit('chatmi:new-chat')}
        >
          <span className="cm-new-chat-icon">＋</span>
          <span>Nuevo chat</span>
          <kbd>Ctrl N</kbd>
        </button>

        <nav className="cm-main-nav">
          <button
            type="button"
            onClick={() => emit('chatmi:search')}
          >
            <span>⌕</span>
            <strong>Buscar chats</strong>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:navigate', 'chat')}
          >
            <span>✦</span>
            <strong>Chat con IA</strong>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:navigate', 'tutor')}
          >
            <span>◈</span>
            <strong>Tutor IA</strong>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:images')}
          >
            <span>▧</span>
            <strong>Imágenes</strong>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:voice')}
          >
            <span>◉</span>
            <strong>Voz</strong>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:documents')}
          >
            <span>▤</span>
            <strong>Documentos</strong>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:navigate', 'dashboard')}
          >
            <span>◇</span>
            <strong>Panel</strong>
          </button>
        </nav>

        <div className="cm-divider" />

        <section className="cm-recents">
          <div className="cm-section-heading">
            <span>Chats recientes</span>
            <button
              type="button"
              aria-label="Administrar conversaciones"
            >
              ···
            </button>
          </div>

          <div className="cm-recent-placeholder">
            <div className="cm-shimmer cm-shimmer-lg" />
            <div className="cm-shimmer" />
            <div className="cm-shimmer cm-shimmer-sm" />
          </div>

          <p className="cm-recents-note">
            Tus conversaciones reales continúan
            administrándose desde ChatMi.
          </p>
        </section>

        <div className="cm-left-spacer" />

        <section className="cm-plan-card">
          <div className="cm-plan-head">
            <div className="cm-user-orb">
              M
            </div>

            <div>
              <strong>Plan Free</strong>
              <span>ChatMi</span>
            </div>
          </div>

          <div className="cm-token-bar">
            <span />
          </div>

          <div className="cm-token-copy">
            <span>Hasta</span>
            <strong>3,000 tokens</strong>
          </div>

          <button
            type="button"
            onClick={() => emit('chatmi:upgrade')}
          >
            <span>♛</span>
            Mejorar plan
          </button>
        </section>
      </aside>

      <div className="chatmi-ultimate-center">
        <div className="cm-center-glow" />

        <div className="cm-center-stage">
          {children}
        </div>
      </div>

      <aside
        className="chatmi-ultimate-right"
        aria-label="Herramientas"
      >
        <section className="cm-promo">
          <div className="cm-promo-art">
            <span className="cm-planet cm-planet-one" />
            <span className="cm-planet cm-planet-two" />
            <span className="cm-light-beam" />
          </div>

          <div className="cm-promo-body">
            <span className="cm-eyebrow">
              CHATMI AI
            </span>

            <h2>
              IA sin límites
              <br />
              para tus ideas
            </h2>

            <p>
              Crea, aprende, analiza y resuelve
              con un espacio diseñado para pensar.
            </p>

            <button
              type="button"
              onClick={() => emit('chatmi:navigate', 'chat')}
            >
              Explorar ChatMi
              <span>→</span>
            </button>
          </div>
        </section>

        <section className="cm-tools-panel">
          <header>
            <h3>Herramientas</h3>
          </header>

          <button
            type="button"
            onClick={() => emit('chatmi:images')}
          >
            <span className="cm-tool-icon cm-green">
              ▧
            </span>

            <span className="cm-tool-copy">
              <strong>Generar imagen</strong>
              <small>Inteligencia visual</small>
            </span>

            <span className="cm-chevron">
              ›
            </span>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:documents')}
          >
            <span className="cm-tool-icon cm-blue">
              ▤
            </span>

            <span className="cm-tool-copy">
              <strong>Analizar documento</strong>
              <small>PDF, DOC y texto</small>
            </span>

            <span className="cm-chevron">
              ›
            </span>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:voice')}
          >
            <span className="cm-tool-icon cm-cyan">
              ◉
            </span>

            <span className="cm-tool-copy">
              <strong>Hablar con IA</strong>
              <small>Conversación por voz</small>
            </span>

            <span className="cm-chevron">
              ›
            </span>
          </button>

          <button
            type="button"
            onClick={() => emit('chatmi:code')}
          >
            <span className="cm-tool-icon cm-purple">
              ◇
            </span>

            <span className="cm-tool-copy">
              <strong>Crear código</strong>
              <small>Desarrollo asistido</small>
            </span>

            <span className="cm-chevron">
              ›
            </span>
          </button>
        </section>

        <section className="cm-files-panel">
          <header>
            <div>
              <h3>Tus archivos</h3>
              <span>Espacio inteligente</span>
            </div>

            <button
              type="button"
              aria-label="Opciones de archivos"
            >
              ···
            </button>
          </header>

          <div className="cm-file-empty">
            <div className="cm-file-symbol">
              ▤
            </div>

            <strong>
              Trabaja con tus documentos
            </strong>

            <p>
              Los archivos utilizados por ChatMi
              aparecerán en tu espacio de trabajo.
            </p>
          </div>

          <button
            type="button"
            className="cm-files-button"
            onClick={() => emit('chatmi:documents')}
          >
            Ver archivos
          </button>
        </section>
      </aside>
    </div>
  );
}