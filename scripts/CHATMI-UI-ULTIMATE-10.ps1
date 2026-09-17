param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Stamp      = Get-Date -Format "yyyyMMdd-HHmmss"
$SrcRoot    = Join-Path $ProjectRoot "src"
$MainFile   = Join-Path $SrcRoot "main.tsx"
$UiRoot     = Join-Path $SrcRoot "ui"
$StylesRoot = Join-Path $SrcRoot "styles"

$BackupRoot = Join-Path `
    $ProjectRoot `
    ".hardening-backups\ui-ultimate-$Stamp"

$ShellFile = Join-Path $UiRoot "PremiumShell.tsx"
$CssFile   = Join-Path $StylesRoot "chatmi-ultimate.css"

# ============================================================
# HELPERS
# ============================================================

function Section {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 100) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 100) -ForegroundColor DarkGray
}

function OK {
    param([string]$Text)

    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Changed {
    param([string]$Text)

    Write-Host "[+]  $Text" -ForegroundColor Magenta
}

function Warn {
    param([string]$Text)

    Write-Host "[!]  $Text" -ForegroundColor Yellow
}

function Write-Utf8 {
    param(
        [string]$Path,
        [string]$Content
    )

    Set-Content `
        -LiteralPath $Path `
        -Value $Content `
        -Encoding UTF8
}

# ============================================================
# VALIDADORES REALES
# ============================================================

function Invoke-Check {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    $Log = Join-Path `
        $env:TEMP `
        "chatmi-ui-$Name-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & $Command *> $Log

        $Code = $LASTEXITCODE

        if ($Code -ne 0) {

            Write-Host ""
            Write-Host "$Name FALLÓ:" -ForegroundColor Red

            Get-Content $Log |
                Select-Object -Last 100 |
                ForEach-Object {
                    Write-Host $_ -ForegroundColor DarkYellow
                }

            return $false
        }

        return $true
    }
    finally {

        Pop-Location

        Remove-Item `
            $Log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Test-TypeScript {
    return Invoke-Check `
        "typescript" `
        { npx tsc --noEmit }
}

function Test-Tests {
    return Invoke-Check `
        "tests" `
        { npm test }
}

function Test-Build {
    return Invoke-Check `
        "build" `
        { npm run build }
}

function Test-CompleteProject {

    Write-Host "TypeScript..." -ForegroundColor Gray

    if (!(Test-TypeScript)) {
        return $false
    }

    Write-Host "Tests..." -ForegroundColor Gray

    if (!(Test-Tests)) {
        return $false
    }

    Write-Host "Build..." -ForegroundColor Gray

    if (!(Test-Build)) {
        return $false
    }

    return $true
}

function Restore-Source {

    Write-Host ""
    Write-Host "RESTAURANDO VERSION ANTERIOR..." -ForegroundColor Yellow

    Remove-Item `
        $SrcRoot `
        -Recurse `
        -Force `
        -ErrorAction SilentlyContinue

    Copy-Item `
        (Join-Path $BackupRoot "src") `
        $SrcRoot `
        -Recurse `
        -Force

    OK "Rollback completado."
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI — ULTIMATE INTERFACE 10/10" -ForegroundColor Cyan
Write-Host " Black AI Workspace / Premium Product UI" -ForegroundColor White
Write-Host ""
Write-Host " $ProjectRoot" -ForegroundColor DarkGray

if (!(Test-Path $ProjectRoot)) {
    throw "No existe el proyecto."
}

if (!(Test-Path $MainFile)) {
    throw "No existe src\main.tsx."
}

# ============================================================
# 1. BASELINE
# ============================================================

Section "1. PROTEGIENDO EL CHATMI 10/10 ACTUAL"

if (!(Test-CompleteProject)) {

    throw (
        "ChatMi no parte de un estado completamente válido. " +
        "No modificaré la interfaz."
    )
}

OK "TypeScript 0 errores."
OK "Tests correctos."
OK "Build producción correcto."

# ============================================================
# 2. BACKUP
# ============================================================

Section "2. BACKUP COMPLETO"

New-Item `
    -ItemType Directory `
    -Path $BackupRoot `
    -Force |
    Out-Null

Copy-Item `
    $SrcRoot `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

OK "Backup:"
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. DIRECTORIOS
# ============================================================

Section "3. CREANDO ARQUITECTURA VISUAL"

New-Item `
    -ItemType Directory `
    -Path $UiRoot `
    -Force |
    Out-Null

New-Item `
    -ItemType Directory `
    -Path $StylesRoot `
    -Force |
    Out-Null

# ============================================================
# 4. PREMIUM SHELL
# ============================================================

$PremiumShell = @'
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
'@

Write-Utf8 `
    -Path $ShellFile `
    -Content $PremiumShell

Changed "PremiumShell.tsx"

# ============================================================
# 5. ULTIMATE CSS
# ============================================================

$UltimateCss = @'
:root {
  --cm-black: #07090c;
  --cm-bg: #0b0e13;
  --cm-bg-2: #0e1218;
  --cm-panel: #11161e;
  --cm-panel-2: #151b24;
  --cm-panel-3: #1a212c;

  --cm-line: rgba(255, 255, 255, 0.075);
  --cm-line-strong: rgba(255, 255, 255, 0.12);

  --cm-white: #f7f8fa;
  --cm-copy: #d7dbe3;
  --cm-muted: #9098a7;
  --cm-faint: #626b7b;

  --cm-blue: #2e8cff;
  --cm-cyan: #00d9ff;
  --cm-green: #16cf83;
  --cm-purple: #8157ff;
  --cm-pink: #e451ff;

  --cm-sidebar: 292px;
  --cm-right: 286px;

  --cm-shadow:
    0 22px 70px rgba(0, 0, 0, 0.35);

  --cm-font:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

/* ==========================================================
   FOUNDATION
   ========================================================== */

html,
body,
#root {
  width: 100%;
  min-width: 0;
  height: 100%;
  margin: 0;
}

html {
  background: var(--cm-black);
}

body {
  overflow: hidden;
  background: var(--cm-bg);
  color: var(--cm-white);
  font-family: var(--cm-font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  border: 0;
}

.chatmi-ultimate-shell {
  position: relative;
  display: grid;
  grid-template-columns:
    var(--cm-sidebar)
    minmax(0, 1fr)
    var(--cm-right);

  width: 100vw;
  height: 100dvh;
  overflow: hidden;

  background:
    radial-gradient(
      circle at 48% -20%,
      rgba(46, 140, 255, 0.09),
      transparent 31%
    ),
    linear-gradient(
      135deg,
      #080a0e,
      #0d1117 50%,
      #07090c
    );
}

.chatmi-ultimate-left,
.chatmi-ultimate-right {
  position: relative;
  z-index: 20;
}

/* ==========================================================
   LEFT SIDEBAR
   ========================================================== */

.chatmi-ultimate-left {
  min-width: 0;
  display: flex;
  flex-direction: column;

  padding:
    18px
    16px;

  background:
    linear-gradient(
      180deg,
      rgba(10, 13, 18, 0.985),
      rgba(7, 9, 13, 0.995)
    );

  border-right:
    1px solid
    var(--cm-line);
}

.cm-brand {
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.cm-logo {
  position: relative;
  width: 43px;
  height: 43px;
  flex: 0 0 43px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle at 35% 30%,
      #3effe8 0,
      #239cff 32%,
      #764cff 67%,
      #14182d 100%
    );

  box-shadow:
    0 0 25px rgba(46, 140, 255, 0.38),
    0 0 35px rgba(129, 87, 255, 0.18);
}

.cm-logo::before {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: #101722;
}

.cm-logo-ring {
  position: absolute;
  z-index: 2;
  border-radius: 50%;
  border: 2px solid rgba(216, 244, 255, 0.92);
}

.cm-ring-a {
  inset: 10px 8px 10px 13px;
  transform: rotate(28deg);
}

.cm-ring-b {
  inset: 9px 12px 9px 9px;
  border-color: rgba(103, 84, 255, 0.95);
  transform: rotate(-32deg);
}

.cm-logo-core {
  position: absolute;
  z-index: 3;

  top: 50%;
  left: 50%;

  width: 6px;
  height: 6px;

  transform:
    translate(-50%, -50%);

  border-radius: 50%;

  background: white;

  box-shadow:
    0 0 10px white;
}

.cm-brand-copy {
  min-width: 0;
  flex: 1;

  display: flex;
  flex-direction: column;
}

.cm-brand-copy strong {
  font-size: 22px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.cm-brand-copy span {
  margin-top: 5px;
  color: var(--cm-faint);
  font-size: 11px;
}

.cm-square-button {
  width: 38px;
  height: 38px;

  border-radius: 12px;

  background: #11161d;
  color: #aab2c0;

  border:
    1px solid
    var(--cm-line);

  cursor: pointer;
}

.cm-square-button:hover {
  background: #181e27;
  color: white;
}

/* NEW CHAT */

.cm-new-chat {
  width: 100%;
  min-height: 47px;

  margin-top: 18px;

  display: flex;
  align-items: center;
  gap: 10px;

  padding:
    0 14px;

  border-radius: 14px;

  background:
    linear-gradient(
      180deg,
      #161d28,
      #121821
    );

  color: #ddebff;

  border:
    1px solid
    rgba(89, 157, 255, 0.28);

  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.03);

  cursor: pointer;
}

.cm-new-chat:hover {
  background:
    linear-gradient(
      180deg,
      #192333,
      #151c27
    );

  border-color:
    rgba(94, 164, 255, 0.48);
}

.cm-new-chat-icon {
  color: #51a6ff;
  font-size: 20px;
}

.cm-new-chat > span:nth-child(2) {
  flex: 1;
  text-align: left;
  font-weight: 600;
}

.cm-new-chat kbd {
  color: #8d96a6;
  font-size: 11px;
  font-family: inherit;
}

/* NAV */

.cm-main-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;

  margin-top: 10px;
}

.cm-main-nav button {
  width: 100%;
  min-height: 41px;

  display: flex;
  align-items: center;
  gap: 13px;

  padding:
    0 13px;

  border-radius: 11px;

  background: transparent;
  color: #b8c0cd;

  cursor: pointer;
}

.cm-main-nav button:hover {
  background:
    rgba(255, 255, 255, 0.045);

  color: white;
}

.cm-main-nav button > span {
  width: 18px;
  color: #b5c2d4;
  text-align: center;
  font-size: 18px;
}

.cm-main-nav strong {
  font-size: 14px;
  font-weight: 500;
}

.cm-divider {
  height: 1px;

  margin:
    12px
    4px;

  background:
    var(--cm-line);
}

/* RECENTS */

.cm-recents {
  min-height: 0;
  color: var(--cm-muted);
}

.cm-section-heading {
  min-height: 32px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding:
    0 9px;
}

.cm-section-heading span {
  font-size: 12px;
  font-weight: 600;
}

.cm-section-heading button {
  background: transparent;
  color: var(--cm-faint);
  cursor: pointer;
}

.cm-recent-placeholder {
  margin:
    9px
    4px
    0;

  padding:
    14px;

  border-radius: 13px;

  background:
    rgba(255, 255, 255, 0.025);

  border:
    1px solid
    rgba(255,255,255,.04);
}

.cm-shimmer {
  width: 74%;
  height: 7px;

  margin-top: 9px;

  border-radius: 999px;

  background:
    linear-gradient(
      90deg,
      #1c222c,
      #262f3d,
      #1c222c
    );

  background-size:
    200% 100%;

  animation:
    cmShimmer
    2.1s
    linear
    infinite;
}

.cm-shimmer:first-child {
  margin-top: 0;
}

.cm-shimmer-lg {
  width: 92%;
}

.cm-shimmer-sm {
  width: 52%;
}

.cm-recents-note {
  margin:
    12px
    11px;

  color: #596273;

  font-size: 11px;
  line-height: 1.5;
}

.cm-left-spacer {
  flex: 1;
}

/* PLAN */

.cm-plan-card {
  padding: 14px;

  border-radius: 17px;

  background:
    linear-gradient(
      160deg,
      rgba(28, 35, 47, 0.95),
      rgba(14, 18, 25, 0.98)
    );

  border:
    1px solid
    var(--cm-line-strong);

  box-shadow:
    0 15px 34px
    rgba(0,0,0,.20);
}

.cm-plan-head {
  display: flex;
  align-items: center;
  gap: 11px;
}

.cm-user-orb {
  width: 40px;
  height: 40px;

  display: grid;
  place-items: center;

  border-radius: 50%;

  background:
    linear-gradient(
      135deg,
      #7953dc,
      #3d2b70
    );

  font-weight: 700;
}

.cm-plan-head > div:last-child {
  display: flex;
  flex-direction: column;
}

.cm-plan-head strong {
  font-size: 14px;
}

.cm-plan-head span {
  margin-top: 3px;
  color: var(--cm-muted);
  font-size: 11px;
}

.cm-token-bar {
  height: 6px;

  margin-top: 13px;

  border-radius: 999px;

  background: #242a34;
  overflow: hidden;
}

.cm-token-bar span {
  display: block;
  width: 42%;
  height: 100%;

  border-radius: inherit;

  background:
    linear-gradient(
      90deg,
      #157cf4,
      #31a5ff
    );

  box-shadow:
    0 0 12px
    rgba(46, 140, 255, 0.4);
}

.cm-token-copy {
  display: flex;
  justify-content: space-between;

  margin-top: 8px;

  color: var(--cm-muted);
  font-size: 11px;
}

.cm-token-copy strong {
  color: #c8d0dc;
  font-weight: 500;
}

.cm-plan-card > button {
  width: 100%;
  min-height: 40px;

  margin-top: 13px;

  border-radius: 12px;

  background:
    linear-gradient(
      180deg,
      #364969,
      #263753
    );

  color: white;

  border:
    1px solid
    rgba(112, 155, 222, 0.2);

  font-weight: 600;
  cursor: pointer;
}

.cm-plan-card > button span {
  margin-right: 7px;
  color: #ffd65d;
}

/* ==========================================================
   CENTER
   ========================================================== */

.chatmi-ultimate-center {
  position: relative;
  min-width: 0;
  height: 100%;

  overflow: hidden;

  background:
    radial-gradient(
      circle at 50% 8%,
      rgba(56, 100, 164, 0.08),
      transparent 28%
    ),
    linear-gradient(
      180deg,
      #0d1117,
      #0a0d12
    );
}

.cm-center-glow {
  pointer-events: none;

  position: absolute;
  z-index: 0;

  top: -300px;
  left: 50%;

  width: 800px;
  height: 650px;

  transform:
    translateX(-50%);

  background:
    radial-gradient(
      ellipse,
      rgba(71, 126, 255, .09),
      transparent 64%
    );

  filter: blur(8px);
}

.cm-center-stage {
  position: relative;
  z-index: 1;

  width: 100%;
  height: 100%;

  overflow: auto;
}

/*
 * El contenido REAL de ChatMi se conserva aquí.
 * Eliminamos fondos claros del app existente.
 */

.cm-center-stage,
.cm-center-stage > * {
  min-width: 0;
}

.cm-center-stage main {
  background:
    transparent !important;
}

.cm-center-stage input,
.cm-center-stage textarea,
.cm-center-stage select {
  color:
    #eef2f8;
}

.cm-center-stage textarea {
  caret-color:
    #8fbaff;
}

/* Cards */

.cm-center-stage
[class*="card"],
.cm-center-stage
[class*="Card"],
.cm-center-stage
[class*="panel"],
.cm-center-stage
[class*="Panel"] {
  border-color:
    var(--cm-line) !important;
}

/* Composer */

.cm-center-stage
[class*="composer"],
.cm-center-stage
[class*="Composer"],
.cm-center-stage
[class*="chat-input"] {
  backdrop-filter:
    blur(18px);
}

/* code */

.cm-center-stage pre {
  border-radius: 15px;

  background:
    #080b10 !important;

  border:
    1px solid
    var(--cm-line);
}

/* ==========================================================
   RIGHT PANEL
   ========================================================== */

.chatmi-ultimate-right {
  min-width: 0;
  overflow-y: auto;

  padding:
    18px
    15px;

  background:
    linear-gradient(
      180deg,
      rgba(8, 11, 15, .985),
      rgba(6, 8, 11, .995)
    );

  border-left:
    1px solid
    var(--cm-line);
}

.cm-promo,
.cm-tools-panel,
.cm-files-panel {
  border-radius: 17px;

  background:
    linear-gradient(
      160deg,
      rgba(18, 24, 33, .97),
      rgba(10, 14, 20, .98)
    );

  border:
    1px solid
    var(--cm-line-strong);

  box-shadow:
    var(--cm-shadow);

  overflow: hidden;
}

/* PROMO */

.cm-promo-art {
  position: relative;

  height: 145px;

  overflow: hidden;

  background:
    radial-gradient(
      circle at 76% 35%,
      rgba(106, 60, 255, .28),
      transparent 26%
    ),
    radial-gradient(
      circle at 68% 55%,
      rgba(0, 161, 255, .20),
      transparent 32%
    ),
    #090c12;
}

.cm-planet {
  position: absolute;

  border-radius: 50%;

  background:
    radial-gradient(
      circle at 70% 26%,
      #f3c997 0,
      #a3745b 6%,
      #20324a 23%,
      #0a111b 56%,
      #030507 76%
    );

  box-shadow:
    inset -18px -15px 35px
    rgba(0,0,0,.85);
}

.cm-planet-one {
  width: 100px;
  height: 100px;

  top: 16px;
  right: 30px;
}

.cm-planet-two {
  width: 114px;
  height: 114px;

  right: -15px;
  bottom: -59px;
}

.cm-light-beam {
  position: absolute;

  width: 180px;
  height: 9px;

  top: 51px;
  right: -19px;

  transform:
    rotate(-31deg);

  border-radius: 999px;

  background:
    linear-gradient(
      90deg,
      transparent,
      #276dff,
      #8344ff,
      transparent
    );

  box-shadow:
    0 0 14px
    rgba(73, 99, 255, .72);
}

.cm-promo-body {
  padding:
    17px
    16px
    18px;
}

.cm-eyebrow {
  display: inline-block;

  margin-bottom: 8px;

  color: #7ba9ff;

  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
}

.cm-promo h2 {
  margin: 0;

  color: white;

  font-size: 22px;
  line-height: 1.17;
  letter-spacing: -.035em;
}

.cm-promo p {
  margin:
    10px
    0
    15px;

  color: #929cab;

  font-size: 12px;
  line-height: 1.55;
}

.cm-promo button {
  width: 100%;
  min-height: 41px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding:
    0 14px;

  border-radius: 11px;

  background: #f3f5f8;
  color: #101318;

  font-size: 13px;
  font-weight: 700;

  cursor: pointer;
}

.cm-promo button:hover {
  background: white;
}

/* TOOLS */

.cm-tools-panel,
.cm-files-panel {
  margin-top: 14px;
  padding: 14px;
}

.cm-tools-panel header,
.cm-files-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  margin-bottom: 9px;
}

.cm-tools-panel h3,
.cm-files-panel h3 {
  margin: 0;

  color: #f0f3f7;

  font-size: 15px;
  letter-spacing: -.02em;
}

.cm-tools-panel > button {
  width: 100%;
  min-height: 59px;

  display: flex;
  align-items: center;
  gap: 11px;

  padding:
    8px
    3px;

  background: transparent;
  color: white;

  border-top:
    1px solid
    rgba(255,255,255,.045);

  cursor: pointer;
}

.cm-tools-panel > button:first-of-type {
  border-top: 0;
}

.cm-tools-panel > button:hover {
  padding-left: 7px;
}

.cm-tool-icon {
  width: 39px;
  height: 39px;
  flex: 0 0 39px;

  display: grid;
  place-items: center;

  border-radius: 11px;

  font-size: 19px;

  box-shadow:
    0 7px 18px
    rgba(0,0,0,.22);
}

.cm-green {
  background:
    linear-gradient(
      135deg,
      #18d274,
      #07934f
    );
}

.cm-blue {
  background:
    linear-gradient(
      135deg,
      #4b8cff,
      #2455ec
    );
}

.cm-cyan {
  background:
    linear-gradient(
      135deg,
      #00aaca,
      #17699e
    );
}

.cm-purple {
  background:
    linear-gradient(
      135deg,
      #e33be8,
      #6f34ef
    );
}

.cm-tool-copy {
  min-width: 0;
  flex: 1;

  display: flex;
  flex-direction: column;

  text-align: left;
}

.cm-tool-copy strong {
  font-size: 12px;
  font-weight: 600;
}

.cm-tool-copy small {
  margin-top: 4px;

  color: #778190;

  font-size: 10px;
}

.cm-chevron {
  color: #646e7d;
  font-size: 21px;
}

/* FILES */

.cm-files-panel header > div {
  display: flex;
  flex-direction: column;
}

.cm-files-panel header span {
  margin-top: 4px;

  color: var(--cm-faint);
  font-size: 10px;
}

.cm-files-panel header button {
  background: transparent;
  color: #727c8a;
  cursor: pointer;
}

.cm-file-empty {
  padding:
    17px
    8px;

  text-align: center;
}

.cm-file-symbol {
  width: 44px;
  height: 44px;

  margin:
    0
    auto
    11px;

  display: grid;
  place-items: center;

  border-radius: 13px;

  background:
    linear-gradient(
      135deg,
      #263041,
      #141a24
    );

  color: #75a3ff;

  border:
    1px solid
    var(--cm-line);
}

.cm-file-empty strong {
  display: block;

  color: #cbd2dc;

  font-size: 12px;
}

.cm-file-empty p {
  margin:
    7px
    auto
    0;

  max-width: 190px;

  color: #687283;

  font-size: 10px;
  line-height: 1.5;
}

.cm-files-button {
  width: 100%;
  min-height: 38px;

  border-radius: 11px;

  background: #161d27;
  color: #bbc5d2;

  border:
    1px solid
    var(--cm-line);

  font-size: 11px;
  font-weight: 600;

  cursor: pointer;
}

.cm-files-button:hover {
  background: #1d2632;
  color: white;
}

/* ==========================================================
   INTERACTION / MOTION
   ========================================================== */

.chatmi-ultimate-shell button {
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    padding 150ms ease,
    transform 150ms ease;
}

.chatmi-ultimate-shell button:active {
  transform:
    scale(.985);
}

@keyframes cmShimmer {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

/* ==========================================================
   AUTH MODE
   Detecta formularios de autenticación existentes.
   ========================================================== */

.chatmi-ultimate-shell:has(
  .auth-panel
) .chatmi-ultimate-left,
.chatmi-ultimate-shell:has(
  .auth-panel
) .chatmi-ultimate-right,
.chatmi-ultimate-shell:has(
  [class*="AuthPanel"]
) .chatmi-ultimate-left,
.chatmi-ultimate-shell:has(
  [class*="AuthPanel"]
) .chatmi-ultimate-right {
  display: none;
}

.chatmi-ultimate-shell:has(
  .auth-panel
),
.chatmi-ultimate-shell:has(
  [class*="AuthPanel"]
) {
  grid-template-columns: 1fr;
}

/* ==========================================================
   RESPONSIVE
   ========================================================== */

@media (max-width: 1320px) {
  :root {
    --cm-sidebar: 255px;
    --cm-right: 255px;
  }
}

@media (max-width: 1120px) {
  .chatmi-ultimate-shell {
    grid-template-columns:
      var(--cm-sidebar)
      minmax(0, 1fr);
  }

  .chatmi-ultimate-right {
    display: none;
  }
}

@media (max-width: 820px) {
  .chatmi-ultimate-shell {
    grid-template-columns: 1fr;
  }

  .chatmi-ultimate-left {
    display: none;
  }

  .chatmi-ultimate-center {
    width: 100vw;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chatmi-ultimate-shell *,
  .chatmi-ultimate-shell *::before,
  .chatmi-ultimate-shell *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
'@

Write-Utf8 `
    -Path $CssFile `
    -Content $UltimateCss

Changed "chatmi-ultimate.css"

# ============================================================
# 6. MODIFICAR MAIN.TSX
# ============================================================

Section "6. INTEGRANDO LA NUEVA INTERFAZ EN MAIN.TSX"

$Main = Get-Content `
    -LiteralPath $MainFile `
    -Raw

$OriginalMain = $Main

$ShellImport =
    "import PremiumShell from './ui/PremiumShell';"

$CssImport =
    "import './styles/chatmi-ultimate.css';"

if (
    $Main -notmatch
    [regex]::Escape($ShellImport)
) {

    $Imports = [regex]::Matches(
        $Main,
        "(?m)^import .*?;\s*$"
    )

    if ($Imports.Count -gt 0) {

        $LastImport =
            $Imports[$Imports.Count - 1]

        $InsertAt =
            $LastImport.Index +
            $LastImport.Length

        $Main = $Main.Insert(
            $InsertAt,
            "`r`n$ShellImport`r`n$CssImport"
        )
    }
    else {

        $Main =
            $ShellImport +
            "`r`n" +
            $CssImport +
            "`r`n" +
            $Main
    }

    Changed "Imports PremiumShell + CSS."
}
else {

    OK "PremiumShell ya estaba importado."
}

# ============================================================
# WRAP AUTHWRAPPER
# ============================================================

if (
    $Main -match '<AuthWrapper\s*/>' -and
    $Main -notmatch '<PremiumShell>\s*<AuthWrapper\s*/>\s*</PremiumShell>'
) {

    $Main = [regex]::Replace(
        $Main,
        '<AuthWrapper\s*/>',
        '<PremiumShell><AuthWrapper /></PremiumShell>',
        1
    )

    Changed "AuthWrapper integrado al shell premium."
}

# ============================================================
# WRAP ADMIN
# ============================================================

if (
    $Main -match '<AdminAppLazy\s*/>' -and
    $Main -notmatch '<PremiumShell>\s*<AdminAppLazy\s*/>\s*</PremiumShell>'
) {

    $Main = [regex]::Replace(
        $Main,
        '<AdminAppLazy\s*/>',
        '<PremiumShell><AdminAppLazy /></PremiumShell>',
        1
    )

    Changed "AdminApp integrado al shell premium."
}

Write-Utf8 `
    -Path $MainFile `
    -Content $Main

# ============================================================
# 7. TYPESCRIPT INMEDIATO
# ============================================================

Section "7. VALIDACION TYPESCRIPT"

if (!(Test-TypeScript)) {

    Write-Utf8 `
        -Path $MainFile `
        -Content $OriginalMain

    throw (
        "La integración JSX no compiló. " +
        "main.tsx fue restaurado."
    )
}

OK "TypeScript 0 errores."

# ============================================================
# 8. VALIDACION TOTAL
# ============================================================

Section "8. VALIDACION COMPLETA"

if (!(Test-CompleteProject)) {

    Warn "La interfaz no superó la validación total."

    Restore-Source

    if (!(Test-CompleteProject)) {

        throw (
            "Rollback realizado, pero revisa " +
            "el proyecto antes de continuar."
        )
    }

    throw (
        "La interfaz Ultimate fue revertida. " +
        "ChatMi anterior quedó restaurado."
    )
}

OK "TypeScript 0 errores."
OK "Tests correctos."
OK "Build producción correcto."

# ============================================================
# 9. AUDIT
# ============================================================

Section "9. SEGURIDAD PRODUCCION"

Push-Location $ProjectRoot

try {

    $RawAudit = (
        & npm audit --omit=dev --json 2>$null |
        Out-String
    )

    $Audit =
        $RawAudit |
        ConvertFrom-Json

    $V =
        $Audit.metadata.vulnerabilities

    Write-Host "Critical : $($V.critical)"
    Write-Host "High     : $($V.high)"
    Write-Host "Moderate : $($V.moderate)"
    Write-Host "Low      : $($V.low)"
}
finally {

    Pop-Location
}

# ============================================================
# 10. RESULTADO
# ============================================================

Section "CHATMI ULTIMATE UI INSTALADA"

Write-Host ""
Write-Host "NUEVA ESTRUCTURA:" -ForegroundColor White

Write-Host ""
Write-Host " LEFT" -ForegroundColor Cyan
Write-Host "  Navegacion"
Write-Host "  Nuevo chat"
Write-Host "  Tutor"
Write-Host "  Imagenes"
Write-Host "  Voz"
Write-Host "  Documentos"
Write-Host "  Plan Free"

Write-Host ""
Write-Host " CENTER" -ForegroundColor Cyan
Write-Host "  ChatMi REAL"
Write-Host "  Gemini"
Write-Host "  Conversaciones"
Write-Host "  Composer"
Write-Host "  Cuotas"
Write-Host "  Todas las funciones existentes"

Write-Host ""
Write-Host " RIGHT" -ForegroundColor Cyan
Write-Host "  Promo AI"
Write-Host "  Herramientas"
Write-Host "  Imagenes"
Write-Host "  Documentos"
Write-Host "  Voz"
Write-Host "  Codigo"
Write-Host "  Archivos"

Write-Host ""
Write-Host "Archivos creados:" -ForegroundColor White
Write-Host "  src\ui\PremiumShell.tsx" -ForegroundColor Cyan
Write-Host "  src\styles\chatmi-ultimate.css" -ForegroundColor Cyan

Write-Host ""
Write-Host "Backup:" -ForegroundColor White
Write-Host "  $BackupRoot" -ForegroundColor Cyan

Write-Host ""
Write-Host ("=" * 100) -ForegroundColor Green
Write-Host " CHATMI — ULTIMATE INTERFACE INSTALADA Y VALIDADA" -ForegroundColor Green
Write-Host ("=" * 100) -ForegroundColor Green