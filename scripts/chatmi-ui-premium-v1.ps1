param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$SrcRoot    = Join-Path $ProjectRoot "src"
$StylesRoot = Join-Path $SrcRoot "styles"
$MainFile   = Join-Path $SrcRoot "main.tsx"

$BackupRoot = Join-Path `
    $ProjectRoot `
    ".hardening-backups\ui-premium-$Stamp"

# ============================================================
# HELPERS
# ============================================================

function Section {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 96) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 96) -ForegroundColor DarkGray
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
# VALIDADORES
# ============================================================

function Test-TypeScript {

    $Log = Join-Path $env:TEMP "chatmi-ui-tsc-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & npx tsc --noEmit *> $Log

        $Code = $LASTEXITCODE

        if ($Code -ne 0) {

            Write-Host ""
            Write-Host "TypeScript:" -ForegroundColor Red

            Get-Content $Log |
                Select-Object -Last 80 |
                ForEach-Object {
                    Write-Host $_ -ForegroundColor DarkYellow
                }
        }

        return [bool]($Code -eq 0)
    }
    finally {

        Pop-Location

        Remove-Item `
            $Log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Test-Tests {

    $Log = Join-Path $env:TEMP "chatmi-ui-tests-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & npm test *> $Log

        $Code = $LASTEXITCODE

        if ($Code -ne 0) {

            Get-Content $Log |
                Select-Object -Last 100 |
                ForEach-Object {
                    Write-Host $_ -ForegroundColor DarkYellow
                }
        }

        return [bool]($Code -eq 0)
    }
    finally {

        Pop-Location

        Remove-Item `
            $Log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Test-Build {

    $Log = Join-Path $env:TEMP "chatmi-ui-build-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & npm run build *> $Log

        $Code = $LASTEXITCODE

        if ($Code -ne 0) {

            Get-Content $Log |
                Select-Object -Last 100 |
                ForEach-Object {
                    Write-Host $_ -ForegroundColor DarkYellow
                }
        }

        return [bool]($Code -eq 0)
    }
    finally {

        Pop-Location

        Remove-Item `
            $Log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Test-Project {

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

# ============================================================
# RESTORE
# ============================================================

function Restore-Source {

    Write-Host ""
    Write-Host "Restaurando src anterior..." -ForegroundColor Yellow

    if (Test-Path $SrcRoot) {

        Remove-Item `
            $SrcRoot `
            -Recurse `
            -Force
    }

    Copy-Item `
        (Join-Path $BackupRoot "src") `
        $SrcRoot `
        -Recurse `
        -Force

    OK "Rollback visual completado."
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI UI PREMIUM — V1" -ForegroundColor Cyan
Write-Host " Black AI Interface / Chat Workspace" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto:" -ForegroundColor Gray
Write-Host " $ProjectRoot" -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    throw "Proyecto no encontrado."
}

if (!(Test-Path $MainFile)) {
    throw "No existe src\main.tsx."
}

# ============================================================
# 1. BASELINE
# ============================================================

Section "1. VALIDANDO CHATMI ANTES DEL REDISEÑO"

if (!(Test-Project)) {

    throw (
        "El proyecto no parte de un estado válido. " +
        "No aplicaré el rediseño."
    )
}

OK "ChatMi está funcional antes de modificar UI."

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

OK "Backup creado:"
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. DIRECTORIO DE ESTILOS
# ============================================================

Section "3. CREANDO SISTEMA VISUAL"

New-Item `
    -ItemType Directory `
    -Path $StylesRoot `
    -Force |
    Out-Null

# ============================================================
# TOKENS
# ============================================================

$TokensFile = Join-Path `
    $StylesRoot `
    "chatmi-tokens.css"

$Tokens = @'
:root {
  color-scheme: dark;

  --chatmi-bg: #0d0d0d;
  --chatmi-bg-deep: #080808;

  --chatmi-sidebar: #111111;
  --chatmi-surface: #161616;
  --chatmi-surface-2: #1c1c1c;
  --chatmi-surface-3: #232323;
  --chatmi-surface-hover: #292929;

  --chatmi-border: rgba(255, 255, 255, 0.09);
  --chatmi-border-strong: rgba(255, 255, 255, 0.15);

  --chatmi-text: #f4f4f4;
  --chatmi-text-soft: #d3d3d3;
  --chatmi-muted: #9b9b9b;
  --chatmi-faint: #6f6f6f;

  --chatmi-accent: #10a37f;
  --chatmi-accent-hover: #19b88e;
  --chatmi-accent-bright: #20c997;

  --chatmi-accent-soft: rgba(16, 163, 127, 0.14);
  --chatmi-accent-border: rgba(16, 163, 127, 0.32);

  --chatmi-danger: #ef6666;
  --chatmi-warning: #e6b95c;
  --chatmi-info: #77a7ff;

  --chatmi-radius-xs: 8px;
  --chatmi-radius-sm: 12px;
  --chatmi-radius-md: 16px;
  --chatmi-radius-lg: 22px;
  --chatmi-radius-xl: 28px;

  --chatmi-sidebar-width: 270px;

  --chatmi-shadow-sm:
    0 4px 18px rgba(0, 0, 0, 0.18);

  --chatmi-shadow-md:
    0 12px 35px rgba(0, 0, 0, 0.28);

  --chatmi-shadow-lg:
    0 24px 70px rgba(0, 0, 0, 0.40);

  --chatmi-transition:
    160ms cubic-bezier(.2, .8, .2, 1);

  --chatmi-font:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
'@

Write-Utf8 $TokensFile $Tokens

Changed "chatmi-tokens.css"

# ============================================================
# LAYOUT
# ============================================================

$LayoutFile = Join-Path `
    $StylesRoot `
    "chatmi-layout.css"

$Layout = @'
html.chatmi-premium-root,
html.chatmi-premium-root body {
  width: 100%;
  height: 100%;
  margin: 0;
  background: var(--chatmi-bg);
}

body.chatmi-premium {
  overflow: hidden;
  background:
    radial-gradient(
      circle at 52% -20%,
      rgba(16, 163, 127, 0.07),
      transparent 34%
    ),
    var(--chatmi-bg);

  color: var(--chatmi-text);
  font-family: var(--chatmi-font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

body.chatmi-premium #root {
  width: 100%;
  height: 100vh;
  min-height: 100vh;
}

/* ==========================================================
   APP ROOT
   ========================================================== */

body.chatmi-premium .chatmi-app,
body.chatmi-premium [class*="app-shell"],
body.chatmi-premium [class*="AppShell"],
body.chatmi-premium [class*="app-container"] {
  width: 100%;
  height: 100vh;
  min-height: 0;
}

/* ==========================================================
   SIDEBAR BRIDGE
   ========================================================== */

body.chatmi-premium aside,
body.chatmi-premium [class*="sidebar"],
body.chatmi-premium [class*="Sidebar"] {
  background:
    linear-gradient(
      180deg,
      #111111 0%,
      #0f0f0f 100%
    ) !important;

  border-color: var(--chatmi-border) !important;
}

/* ==========================================================
   HEADER
   ========================================================== */

body.chatmi-premium header,
body.chatmi-premium [class*="topbar"],
body.chatmi-premium [class*="Topbar"],
body.chatmi-premium [class*="header"] {
  border-color: var(--chatmi-border) !important;
}

/* ==========================================================
   MAIN
   ========================================================== */

body.chatmi-premium main {
  background:
    linear-gradient(
      180deg,
      #0d0d0d 0%,
      #0b0b0b 100%
    );
}

/* ==========================================================
   SCROLL
   ========================================================== */

body.chatmi-premium * {
  scrollbar-width: thin;
  scrollbar-color:
    #3c3c3c
    transparent;
}

body.chatmi-premium *::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

body.chatmi-premium *::-webkit-scrollbar-track {
  background: transparent;
}

body.chatmi-premium *::-webkit-scrollbar-thumb {
  background: #343434;
  border-radius: 999px;
}

body.chatmi-premium *::-webkit-scrollbar-thumb:hover {
  background: #454545;
}
'@

Write-Utf8 $LayoutFile $Layout

Changed "chatmi-layout.css"

# ============================================================
# COMPONENTS
# ============================================================

$ComponentsFile = Join-Path `
    $StylesRoot `
    "chatmi-components.css"

$Components = @'
/* ==========================================================
   GLOBAL RESET
   ========================================================== */

body.chatmi-premium *,
body.chatmi-premium *::before,
body.chatmi-premium *::after {
  box-sizing: border-box;
}

body.chatmi-premium button,
body.chatmi-premium input,
body.chatmi-premium textarea,
body.chatmi-premium select {
  font-family: inherit;
}

body.chatmi-premium button {
  transition:
    background var(--chatmi-transition),
    color var(--chatmi-transition),
    border-color var(--chatmi-transition),
    transform var(--chatmi-transition),
    box-shadow var(--chatmi-transition);
}

body.chatmi-premium a {
  color: inherit;
}

/* ==========================================================
   SIDEBAR
   ========================================================== */

body.chatmi-premium aside {
  color: var(--chatmi-text-soft);
}

body.chatmi-premium aside button,
body.chatmi-premium aside a {
  border-radius: var(--chatmi-radius-sm);
}

body.chatmi-premium aside button:hover,
body.chatmi-premium aside a:hover {
  background: var(--chatmi-surface-2);
}

body.chatmi-premium
[class*="sidebar"]
button:hover,
body.chatmi-premium
[class*="Sidebar"]
button:hover {
  background: var(--chatmi-surface-2) !important;
}

body.chatmi-premium
[class*="sidebar"]
[class*="active"],
body.chatmi-premium
[class*="Sidebar"]
[class*="active"] {
  background: var(--chatmi-surface-2) !important;
  color: var(--chatmi-text) !important;
}

/* ==========================================================
   HEADER / TOPBAR
   ========================================================== */

body.chatmi-premium header {
  background:
    rgba(13, 13, 13, 0.86);

  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

/* ==========================================================
   CARDS
   ========================================================== */

body.chatmi-premium
[class*="card"],
body.chatmi-premium
[class*="Card"],
body.chatmi-premium
[class*="panel"],
body.chatmi-premium
[class*="Panel"] {
  background:
    linear-gradient(
      180deg,
      var(--chatmi-surface) 0%,
      #131313 100%
    );

  border-color:
    var(--chatmi-border) !important;

  box-shadow:
    var(--chatmi-shadow-sm);
}

/* ==========================================================
   BUTTONS
   ========================================================== */

body.chatmi-premium button {
  color: var(--chatmi-text);
}

body.chatmi-premium button:not(:disabled):active {
  transform: scale(0.985);
}

body.chatmi-premium
button[class*="primary"],
body.chatmi-premium
[class*="PrimaryButton"],
body.chatmi-premium
[class*="upgrade"] button {
  background:
    linear-gradient(
      180deg,
      var(--chatmi-accent-bright),
      var(--chatmi-accent)
    ) !important;

  color: #04130f !important;

  border:
    1px solid
    rgba(255, 255, 255, 0.05) !important;

  box-shadow:
    0 10px 28px
    rgba(16, 163, 127, 0.22);
}

body.chatmi-premium
button[class*="primary"]:hover {
  background:
    linear-gradient(
      180deg,
      #29d7a6,
      var(--chatmi-accent-hover)
    ) !important;
}

/* ==========================================================
   INPUTS
   ========================================================== */

body.chatmi-premium input,
body.chatmi-premium textarea,
body.chatmi-premium select {
  background:
    var(--chatmi-surface) !important;

  color:
    var(--chatmi-text) !important;

  border:
    1px solid
    var(--chatmi-border) !important;

  border-radius:
    var(--chatmi-radius-md);

  outline: none;
}

body.chatmi-premium input::placeholder,
body.chatmi-premium textarea::placeholder {
  color:
    var(--chatmi-faint);
}

body.chatmi-premium input:focus,
body.chatmi-premium textarea:focus,
body.chatmi-premium select:focus {
  border-color:
    var(--chatmi-accent-border) !important;

  box-shadow:
    0 0 0 4px
    rgba(16, 163, 127, 0.08);
}

/* ==========================================================
   CHAT AREA
   ========================================================== */

body.chatmi-premium
[class*="chat-window"],
body.chatmi-premium
[class*="ChatWindow"],
body.chatmi-premium
[class*="conversation"],
body.chatmi-premium
[class*="messages"] {
  background:
    var(--chatmi-bg);
}

/* ==========================================================
   MESSAGE ROWS
   ========================================================== */

body.chatmi-premium
[class*="message"] {
  border-color:
    var(--chatmi-border);
}

body.chatmi-premium
[class*="assistant"],
body.chatmi-premium
[class*="model-message"] {
  color:
    var(--chatmi-text);
}

/* ==========================================================
   MESSAGE BUBBLES
   ========================================================== */

body.chatmi-premium
[class*="bubble"],
body.chatmi-premium
[class*="Bubble"] {
  background:
    var(--chatmi-surface) !important;

  border:
    1px solid
    var(--chatmi-border) !important;

  color:
    var(--chatmi-text);

  border-radius:
    var(--chatmi-radius-lg);

  box-shadow:
    var(--chatmi-shadow-sm);
}

/* ==========================================================
   COMPOSER / MESSAGE INPUT
   ========================================================== */

body.chatmi-premium
[class*="composer"],
body.chatmi-premium
[class*="Composer"],
body.chatmi-premium
[class*="chat-input"],
body.chatmi-premium
[class*="ChatInput"] {
  background:
    rgba(24, 24, 24, 0.96);

  border-color:
    var(--chatmi-border) !important;

  box-shadow:
    var(--chatmi-shadow-lg);

  backdrop-filter: blur(18px);
}

body.chatmi-premium
[class*="composer"]
textarea,
body.chatmi-premium
[class*="Composer"]
textarea,
body.chatmi-premium
[class*="chat-input"]
textarea {
  background:
    transparent !important;

  border:
    0 !important;

  box-shadow:
    none !important;
}

/* ==========================================================
   SEND BUTTON
   ========================================================== */

body.chatmi-premium
button[class*="send"],
body.chatmi-premium
button[aria-label*="Enviar"],
body.chatmi-premium
button[title*="Enviar"] {
  background:
    var(--chatmi-text) !important;

  color:
    #0d0d0d !important;

  border-radius:
    50%;

  box-shadow:
    var(--chatmi-shadow-sm);
}

body.chatmi-premium
button[class*="send"]:hover {
  background:
    #ffffff !important;
}

/* ==========================================================
   TOKEN / PLAN BADGES
   ========================================================== */

body.chatmi-premium
[class*="token"],
body.chatmi-premium
[class*="quota"],
body.chatmi-premium
[class*="badge"],
body.chatmi-premium
[class*="Badge"] {
  border-color:
    var(--chatmi-border) !important;
}

/* ==========================================================
   PREMIUM
   ========================================================== */

body.chatmi-premium
[class*="premium"],
body.chatmi-premium
[class*="Premium"] {
  --premium-accent:
    var(--chatmi-accent);
}

/* ==========================================================
   AUTH
   ========================================================== */

body.chatmi-premium
[class*="auth"],
body.chatmi-premium
[class*="Auth"] {
  color:
    var(--chatmi-text);
}

body.chatmi-premium
[class*="auth"]
form,
body.chatmi-premium
[class*="Auth"]
form {
  background:
    linear-gradient(
      180deg,
      #171717,
      #121212
    );

  border:
    1px solid
    var(--chatmi-border);

  box-shadow:
    var(--chatmi-shadow-lg);
}

/* ==========================================================
   MODALS
   ========================================================== */

body.chatmi-premium
[class*="modal"],
body.chatmi-premium
[class*="Modal"],
body.chatmi-premium
[role="dialog"] {
  background:
    var(--chatmi-surface) !important;

  color:
    var(--chatmi-text);

  border-color:
    var(--chatmi-border) !important;

  box-shadow:
    var(--chatmi-shadow-lg);
}

/* ==========================================================
   TABLES / ADMIN
   ========================================================== */

body.chatmi-premium table {
  width: 100%;
  border-collapse: collapse;
  color: var(--chatmi-text-soft);
}

body.chatmi-premium th {
  background:
    #181818;

  color:
    var(--chatmi-text);

  border-color:
    var(--chatmi-border) !important;
}

body.chatmi-premium td {
  border-color:
    var(--chatmi-border) !important;
}

body.chatmi-premium tbody tr:hover {
  background:
    rgba(255, 255, 255, 0.025);
}

/* ==========================================================
   PAYPAL AREA
   ========================================================== */

body.chatmi-premium
[class*="paypal"],
body.chatmi-premium
[class*="PayPal"] {
  border-radius:
    var(--chatmi-radius-lg);

  overflow:
    hidden;
}

/* ==========================================================
   TIMELINE
   ========================================================== */

body.chatmi-premium
[class*="timeline"],
body.chatmi-premium
[class*="Timeline"] {
  color:
    var(--chatmi-text-soft);
}

/* ==========================================================
   CODE
   ========================================================== */

body.chatmi-premium pre {
  background:
    #080808 !important;

  border:
    1px solid
    var(--chatmi-border);

  border-radius:
    var(--chatmi-radius-md);

  overflow:
    auto;
}

body.chatmi-premium code {
  font-family:
    "SFMono-Regular",
    Consolas,
    "Liberation Mono",
    monospace;
}

/* ==========================================================
   SELECTION
   ========================================================== */

body.chatmi-premium ::selection {
  background:
    rgba(16, 163, 127, 0.32);

  color:
    white;
}
'@

Write-Utf8 $ComponentsFile $Components

Changed "chatmi-components.css"

# ============================================================
# PREMIUM CHAT CSS
# ============================================================

$ChatFile = Join-Path `
    $StylesRoot `
    "chatmi-chat-premium.css"

$ChatCSS = @'
/* ==========================================================
   CHATMI CHAT EXPERIENCE
   ========================================================== */

body.chatmi-premium
.chatmi-chat-shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

body.chatmi-premium
.chatmi-chat-content {
  width: min(100%, 900px);
  margin-inline: auto;
  padding:
    30px
    24px
    190px;
}

/* GENERIC CHAT WIDTH BRIDGE */

body.chatmi-premium
[class*="messages"] > *,
body.chatmi-premium
[class*="conversation"] > * {
  max-width:
    920px;
}

/* EMPTY HERO */

body.chatmi-premium
.chatmi-empty {
  width:
    min(100%, 760px);

  margin:
    auto;

  padding:
    34px;

  background:
    linear-gradient(
      180deg,
      rgba(24, 24, 24, 0.97),
      rgba(16, 16, 16, 0.97)
    );

  border:
    1px solid
    var(--chatmi-border);

  border-radius:
    var(--chatmi-radius-xl);

  box-shadow:
    var(--chatmi-shadow-md);
}

/* GENERIC TEXT */

body.chatmi-premium h1,
body.chatmi-premium h2,
body.chatmi-premium h3 {
  color:
    var(--chatmi-text);

  letter-spacing:
    -0.02em;
}

body.chatmi-premium p {
  color:
    inherit;
}

/* LINKS */

body.chatmi-premium main a {
  color:
    var(--chatmi-accent-bright);
}

/* SEPARATORS */

body.chatmi-premium hr {
  border:
    0;

  border-top:
    1px solid
    var(--chatmi-border);
}
'@

Write-Utf8 $ChatFile $ChatCSS

Changed "chatmi-chat-premium.css"

# ============================================================
# MOTION
# ============================================================

$MotionFile = Join-Path `
    $StylesRoot `
    "chatmi-motion.css"

$Motion = @'
@keyframes chatmiFadeUp {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes chatmiPulse {
  0%,
  100% {
    opacity: .45;
  }

  50% {
    opacity: 1;
  }
}

body.chatmi-premium
[class*="message"] {
  animation:
    chatmiFadeUp
    180ms
    ease-out;
}

body.chatmi-premium
[class*="typing"] {
  animation:
    chatmiPulse
    1.2s
    ease-in-out
    infinite;
}

@media (prefers-reduced-motion: reduce) {
  body.chatmi-premium *,
  body.chatmi-premium *::before,
  body.chatmi-premium *::after {
    animation-duration:
      0.001ms !important;

    animation-iteration-count:
      1 !important;

    transition-duration:
      0.001ms !important;
  }
}
'@

Write-Utf8 $MotionFile $Motion

Changed "chatmi-motion.css"

# ============================================================
# RESPONSIVE
# ============================================================

$ResponsiveFile = Join-Path `
    $StylesRoot `
    "chatmi-responsive.css"

$Responsive = @'
@media (max-width: 1100px) {

  body.chatmi-premium {
    --chatmi-sidebar-width:
      230px;
  }
}

@media (max-width: 820px) {

  body.chatmi-premium
  .chatmi-chat-content {
    padding:
      22px
      14px
      170px;
  }

  body.chatmi-premium
  [class*="sidebar"],
  body.chatmi-premium
  [class*="Sidebar"] {
    max-width:
      86vw;
  }

  body.chatmi-premium
  [class*="modal"],
  body.chatmi-premium
  [role="dialog"] {
    max-width:
      calc(100vw - 24px);
  }
}

@media (max-width: 560px) {

  body.chatmi-premium {
    font-size:
      14px;
  }

  body.chatmi-premium
  button {
    min-height:
      40px;
  }

  body.chatmi-premium
  textarea {
    font-size:
      16px;
  }

  body.chatmi-premium
  .chatmi-chat-content {
    padding-inline:
      10px;
  }
}
'@

Write-Utf8 $ResponsiveFile $Responsive

Changed "chatmi-responsive.css"

# ============================================================
# MASTER
# ============================================================

$MasterFile = Join-Path `
    $StylesRoot `
    "chatmi-premium.css"

$MasterCSS = @'
@import './chatmi-tokens.css';
@import './chatmi-layout.css';
@import './chatmi-components.css';
@import './chatmi-chat-premium.css';
@import './chatmi-motion.css';
@import './chatmi-responsive.css';
'@

Write-Utf8 $MasterFile $MasterCSS

Changed "chatmi-premium.css"

# ============================================================
# 4. PATCH MAIN.TSX
# ============================================================

Section "4. IMPORTANDO TEMA EN MAIN.TSX"

$Main = Get-Content `
    -LiteralPath $MainFile `
    -Raw

$OriginalMain = $Main

$ImportLine =
    "import './styles/chatmi-premium.css';"

if (
    $Main -notmatch
    [regex]::Escape($ImportLine)
) {

    if (
        $Main -match
        "import\s+['""]\.\/index\.css['""];?"
    ) {

        $Main = [regex]::Replace(
            $Main,
            "(import\s+['""]\.\/index\.css['""];?)",
            "`$1`r`n$ImportLine",
            1
        )
    }
    else {

        $Main =
            $ImportLine +
            "`r`n" +
            $Main
    }

    Changed "Tema importado en main.tsx."
}
else {

    OK "El import CSS ya existía."
}

# ============================================================
# BODY THEME ACTIVATION
# ============================================================

$ThemeActivation = @'
document.documentElement.classList.add('chatmi-premium-root');
document.body.classList.add('chatmi-premium');
'@

if (
    $Main -notmatch
    "chatmi-premium-root"
) {

    $rootMarker =
        "const rootElement = document.getElementById('root');"

    if ($Main.Contains($rootMarker)) {

        $Main = $Main.Replace(
            $rootMarker,
            $ThemeActivation +
            "`r`n`r`n" +
            $rootMarker
        )

        Changed "Tema activado en HTML/body."
    }
    else {

        $LastImport =
            [regex]::Matches(
                $Main,
                "(?m)^import .*?;\s*$"
            ) |
            Select-Object -Last 1

        if ($LastImport) {

            $Position =
                $LastImport.Index +
                $LastImport.Length

            $Main =
                $Main.Insert(
                    $Position,
                    "`r`n`r`n" +
                    $ThemeActivation
                )

            Changed "Tema activado después de imports."
        }
        else {

            $Main =
                $ThemeActivation +
                "`r`n`r`n" +
                $Main
        }
    }
}

Write-Utf8 `
    -Path $MainFile `
    -Content $Main

# ============================================================
# 5. VALIDAR MAIN
# ============================================================

Section "5. VALIDANDO IMPORTACION"

if (!(Test-TypeScript)) {

    Warn "El cambio en main.tsx produjo error."

    Write-Utf8 `
        -Path $MainFile `
        -Content $OriginalMain

    throw "Se revirtió main.tsx."
}

OK "main.tsx compila correctamente."

# ============================================================
# 6. CREAR UI MANIFEST
# ============================================================

Section "6. REGISTRANDO THEME"

$ThemeManifest = Join-Path `
    $StylesRoot `
    "README-CHATMI-PREMIUM.txt"

$Manifest = @"
CHATMI PREMIUM UI
=================

Theme: Black AI Workspace
Version: 1.0

Archivos:

- chatmi-premium.css
- chatmi-tokens.css
- chatmi-layout.css
- chatmi-components.css
- chatmi-chat-premium.css
- chatmi-motion.css
- chatmi-responsive.css

Import:

import './styles/chatmi-premium.css';

Body:

chatmi-premium

HTML:

chatmi-premium-root

Backup:

$BackupRoot
"@

Write-Utf8 `
    -Path $ThemeManifest `
    -Content $Manifest

OK "Theme manifest creado."

# ============================================================
# 7. VALIDACION FINAL
# ============================================================

Section "7. VALIDACION FINAL COMPLETA"

if (!(Test-Project)) {

    Warn "El rediseño no pasó la validación."

    Restore-Source

    if (!(Test-Project)) {

        throw (
            "El rollback visual fue restaurado, " +
            "pero el proyecto requiere revisión."
        )
    }

    throw (
        "Rediseño revertido automáticamente. " +
        "ChatMi original está restaurado."
    )
}

OK "TypeScript: 0 errores."
OK "Tests: correctos."
OK "Build: correcto."

# ============================================================
# 8. SECURITY
# ============================================================

Section "8. VALIDANDO SEGURIDAD"

Push-Location $ProjectRoot

try {

    $AuditRaw = (
        & npm audit --omit=dev --json 2>$null |
        Out-String
    )

    $Audit = $AuditRaw |
        ConvertFrom-Json

    $V = $Audit.metadata.vulnerabilities

    Write-Host "Critical : $($V.critical)"
    Write-Host "High     : $($V.high)"
    Write-Host "Moderate : $($V.moderate)"
    Write-Host "Low      : $($V.low)"
}
finally {
    Pop-Location
}

# ============================================================
# FINAL
# ============================================================

Section "CHATMI PREMIUM UI INSTALADA"

Write-Host ""
Write-Host "Tema:" -ForegroundColor White
Write-Host "  Black Premium AI Interface" -ForegroundColor Cyan

Write-Host ""
Write-Host "Importado desde:" -ForegroundColor White
Write-Host "  src\main.tsx" -ForegroundColor Cyan

Write-Host ""
Write-Host "CSS maestro:" -ForegroundColor White
Write-Host "  src\styles\chatmi-premium.css" -ForegroundColor Cyan

Write-Host ""
Write-Host "Backup:" -ForegroundColor White
Write-Host "  $BackupRoot" -ForegroundColor Cyan

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " CHATMI PREMIUM UI — LISTA PARA EJECUTAR" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green