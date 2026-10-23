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
    <div className="chatmi-ultimate-shell">
      <aside className="chatmi-ultimate-left" aria-label="Navegación principal">
        <div className="cm-brand">
          <div className="cm-logo" aria-hidden="true">CM</div>
          <div className="cm-brand-copy">
            <strong>ChatMi</strong>
            <span>IA migratoria</span>
          </div>
        </div>

        <button className="cm-primary" type="button" onClick={() => emit('chatmi:new-chat')}>
          <span>＋</span>
          Nuevo chat
        </button>

        <nav className="cm-nav">
          <button type="button" onClick={() => emit('chatmi:navigate', 'chat')}>✦ Chat con IA</button>
          <button type="button" onClick={() => emit('chatmi:voice')}>◉ Conversación por voz</button>
          <button type="button" onClick={() => emit('chatmi:navigate', 'dashboard')}>◇ Mi cuenta</button>
        </nav>

        <div className="cm-sidebar-spacer" />

        <section className="cm-plan">
          <span>PLAN ACTUAL</span>
          <strong>ChatMi</strong>
          <small>Asistencia migratoria con IA</small>
          <button type="button" onClick={() => emit('chatmi:upgrade')}>Mejorar plan →</button>
        </section>
      </aside>

      <main className="chatmi-ultimate-center">
        <div className="cm-center-glow" aria-hidden="true" />
        <div className="cm-center-stage">{children}</div>
      </main>

      <aside className="chatmi-ultimate-right" aria-label="Información de ChatMi">
        <section className="cm-promo">
          <span className="cm-eyebrow">CHATMI AI</span>
          <h2>IA potente para decisiones migratorias más claras.</h2>
          <p>
            Conversa, organiza requisitos, prepara entrevistas y entiende tus próximos pasos desde un solo espacio.
          </p>
          <button type="button" onClick={() => emit('chatmi:navigate', 'chat')}>Abrir ChatMi →</button>
        </section>

        <section className="cm-status-card">
          <div><span className="cm-dot" /> Gemini conectado por backend</div>
          <div><span className="cm-dot" /> Clave protegida del navegador</div>
          <div><span className="cm-dot" /> Voz con token efímero</div>
        </section>
      </aside>
    </div>
  );
}
