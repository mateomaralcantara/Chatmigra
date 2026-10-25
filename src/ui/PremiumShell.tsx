import { useEffect, useState, type ReactNode } from 'react';
import ProfilePhotoMenu from './ProfilePhotoMenu';

type PaletteId = 'classic' | 'ocean' | 'mint' | 'violet';

const PALETTES: { id: PaletteId; name: string; swatch: string }[] = [
  { id: 'classic', name: 'Clásico', swatch: '#ffffff' },
  { id: 'ocean', name: 'Azul', swatch: '#2563eb' },
  { id: 'mint', name: 'Verde', swatch: '#047857' },
  { id: 'violet', name: 'Violeta', swatch: '#7c3aed' },
];

function preferredPalette(): PaletteId {
  try {
    const saved = window.localStorage.getItem('chatmi:palette');
    if (PALETTES.some((palette) => palette.id === saved)) return saved as PaletteId;
  } catch {
    // Private browsing may disable localStorage.
  }
  return 'classic';
}

interface PremiumShellProps {
  children: ReactNode;
}

function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export default function PremiumShell({ children }: PremiumShellProps) {
  const [palette, setPalette] = useState<PaletteId>(preferredPalette);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('chatmi:palette', palette);
    } catch {
      // Theme remains usable for this session.
    }
  }, [palette]);

  if (window.location.pathname.startsWith('/reset-password')) {
    return <>{children}</>;
  }

  return (
    <div className="cm-reference-shell" data-cm-theme={palette}>
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

        <ProfilePhotoMenu position="rail" onAccount={() => emit('chatmi:navigate', 'dashboard')} />
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
            <div className="cm-theme-picker">
              <button
                type="button"
                className="cm-theme-trigger"
                aria-label="Elegir colores de ChatMi"
                title="Personalizar colores"
                aria-expanded={paletteMenuOpen}
                aria-controls="cm-theme-options"
                onClick={() => setPaletteMenuOpen((open) => !open)}
              >
                <span aria-hidden="true">🎨</span>
                <span className="cm-theme-trigger-label">Colores</span>
              </button>
              {paletteMenuOpen && (
                <div
                  className="cm-theme-menu"
                  id="cm-theme-options"
                  role="group"
                  aria-label="Paletas de colores"
                >
                  <strong className="cm-theme-menu-title">Elige un color</strong>
                  {PALETTES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={['cm-theme-option', palette === option.id ? 'is-selected' : ''].join(' ')}
                      aria-pressed={palette === option.id}
                      onClick={() => {
                        setPalette(option.id);
                        setPaletteMenuOpen(false);
                      }}
                    >
                      <span className="cm-theme-swatch" style={{ background: option.swatch }} aria-hidden="true" />
                      <span>{option.name}</span>
                      {palette === option.id && <span className="cm-theme-check" aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="cm-connection" title="Gemini conectado">
              <span className="cm-connection-dot" />
              IA
            </span>
            <ProfilePhotoMenu position="top" onAccount={() => emit('chatmi:navigate', 'dashboard')} />
          </div>
        </header>

        <main className="cm-reference-stage">
          {children}
        </main>
      </section>
    </div>
  );
}
