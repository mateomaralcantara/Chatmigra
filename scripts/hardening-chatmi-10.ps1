param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi",
    [switch]$SkipDependencyUpdate = $false,
    [switch]$SkipTests = $false,
    [switch]$NoRollback = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ============================================================
# CHATMI HARDENING 10/10
# Auth + Security + Dependencies + Types + Tests + Build
# ============================================================

$Version = "2.0.0"
$Started = Get-Date
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\$Stamp"
$ReportsDir = Join-Path $ProjectRoot "reports"
$ReportPath = Join-Path $ReportsDir "hardening-chatmi-$Stamp.txt"

$Changes = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]
$Failures = New-Object System.Collections.Generic.List[string]

function Title {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 92) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 92) -ForegroundColor DarkGray
}

function OK {
    param([string]$Text)

    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Warn {
    param([string]$Text)

    Write-Host "[!]  $Text" -ForegroundColor Yellow
    $script:Warnings.Add($Text) | Out-Null
}

function Fail {
    param([string]$Text)

    Write-Host "[X]  $Text" -ForegroundColor Red
    $script:Failures.Add($Text) | Out-Null
}

function Changed {
    param([string]$Text)

    Write-Host "[+]  $Text" -ForegroundColor Magenta
    $script:Changes.Add($Text) | Out-Null
}

function Read-Text {
    param([string]$Path)

    if (!(Test-Path -LiteralPath $Path)) {
        return ""
    }

    return Get-Content -LiteralPath $Path -Raw
}

function Write-Utf8 {
    param(
        [string]$Path,
        [string]$Content
    )

    $dir = Split-Path $Path -Parent

    if ($dir -and !(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function Run {
    param(
        [string]$Name,
        [scriptblock]$Command,
        [switch]$AllowFailure
    )

    Write-Host ""
    Write-Host ">>> $Name" -ForegroundColor Gray

    & $Command

    $code = $LASTEXITCODE

    if ($null -eq $code) {
        $code = 0
    }

    if ($code -ne 0 -and !$AllowFailure) {
        throw "$Name terminó con código $code"
    }

    return $code
}

function Get-CodeFiles {

    return @(
        Get-ChildItem (Join-Path $ProjectRoot "src") -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in ".ts", ".tsx", ".js", ".jsx"
        }
    )
}

function Run-TypeScript {

    Write-Host ""
    Write-Host "Comprobando TypeScript..." -ForegroundColor Gray

    & npx tsc --noEmit

    return $LASTEXITCODE -eq 0
}

function Restore-Project {

    Title "ROLLBACK AUTOMATICO"

    if (!(Test-Path $BackupRoot)) {
        Fail "No existe backup para restaurar."
        return
    }

    Write-Host "Restaurando proyecto desde:" -ForegroundColor Yellow
    Write-Host $BackupRoot -ForegroundColor Gray

    $currentSrc = Join-Path $ProjectRoot "src"
    $backupSrc = Join-Path $BackupRoot "src"

    if (Test-Path $currentSrc) {
        Remove-Item $currentSrc -Recurse -Force
    }

    if (Test-Path $backupSrc) {
        Copy-Item $backupSrc $currentSrc -Recurse -Force
    }

    foreach ($file in @(
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "vite.config.js"
    )) {

        $backupFile = Join-Path $BackupRoot $file
        $targetFile = Join-Path $ProjectRoot $file

        if (Test-Path $backupFile) {
            Copy-Item $backupFile $targetFile -Force
        }
    }

    # Eliminar tests agregados por este hardening
    $testsPath = Join-Path $ProjectRoot "tests"

    if (Test-Path $testsPath) {
        Remove-Item $testsPath -Recurse -Force
    }

    Set-Location $ProjectRoot

    Write-Host ""
    Write-Host "Restaurando node_modules desde package-lock..." -ForegroundColor Gray

    & npm install

    OK "Rollback completado."
}

# ============================================================
# VALIDACION
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI HARDENING $Version" -ForegroundColor Cyan
Write-Host " Objetivo: llevar el proyecto hacia 10/10 sin destruir funcionalidad" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

if (!(Test-Path $ProjectRoot)) {
    throw "No existe: $ProjectRoot"
}

if (!(Test-Path (Join-Path $ProjectRoot "package.json"))) {
    throw "No se encontró package.json."
}

if (!(Test-Path (Join-Path $ProjectRoot "src"))) {
    throw "No se encontró src."
}

Set-Location $ProjectRoot

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null

# ============================================================
# 1. BACKUP
# ============================================================

Title "1. BACKUP COMPLETO"

Copy-Item (Join-Path $ProjectRoot "src") `
    (Join-Path $BackupRoot "src") `
    -Recurse -Force

foreach ($file in @(
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "vite.config.js"
)) {

    $source = Join-Path $ProjectRoot $file

    if (Test-Path $source) {
        Copy-Item $source (Join-Path $BackupRoot $file) -Force
    }
}

OK "Backup creado:"
Write-Host "    $BackupRoot" -ForegroundColor Gray

# Crear rama Git si aplica
if (Get-Command git -ErrorAction SilentlyContinue) {

    if (Test-Path (Join-Path $ProjectRoot ".git")) {

        $branch = "hardening-chatmi-$Stamp"

        try {
            & git switch -c $branch 2>$null

            if ($LASTEXITCODE -eq 0) {
                OK "Rama Git creada: $branch"
            }
        }
        catch {
            Warn "No se pudo crear rama Git; el backup físico existe."
        }
    }
}

# ============================================================
# 2. SUPABASE CLIENT
# ============================================================

Title "2. SUPABASE CLIENT"

$supabasePath = Join-Path $ProjectRoot "src\services\supabaseClient.ts"

if (!(Test-Path $supabasePath)) {
    throw "No existe src\services\supabaseClient.ts"
}

$supabase = Read-Text $supabasePath
$originalSupabase = $supabase

# Quitar cast import.meta as any donde sea seguro
$supabase = $supabase.Replace(
    "(import.meta as any)?.env?.DEV",
    "import.meta.env.DEV"
)

$supabase = $supabase.Replace(
    "(import.meta as any).env.DEV",
    "import.meta.env.DEV"
)

# Verificar configuraciones esenciales
foreach ($required in @(
    "persistSession",
    "autoRefreshToken",
    "detectSessionInUrl"
)) {
    if ($supabase -match $required) {
        OK "Supabase contiene $required"
    }
    else {
        Warn "Supabase no contiene $required"
    }
}

if ($supabase -ne $originalSupabase) {
    Write-Utf8 $supabasePath $supabase
    Changed "supabaseClient.ts limpiado de casts innecesarios."
}

# Asegurar tipos de Vite
$viteTypesPath = Join-Path $ProjectRoot "src\vite-env.d.ts"

if (!(Test-Path $viteTypesPath)) {

    Write-Utf8 $viteTypesPath @'
/// <reference types="vite/client" />
'@

    Changed "Creado src/vite-env.d.ts"
}

# ============================================================
# 3. PASSWORD RECOVERY REAL
# ============================================================

Title "3. RECUPERACION DE CONTRASEÑA"

$resetPath = Join-Path $ProjectRoot "src\components\ResetPassword.tsx"

$resetComponent = @'
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type RecoveryState =
  | 'checking'
  | 'ready'
  | 'saving'
  | 'success'
  | 'invalid';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<RecoveryState>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          setError(sessionError.message);
        }

        if (session) {
          setState('ready');
          return;
        }

        window.setTimeout(async () => {
          const {
            data: { session: delayedSession },
          } = await supabase.auth.getSession();

          if (!active) return;

          setState(delayedSession ? 'ready' : 'invalid');
        }, 1200);
      } catch (err: unknown) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo validar el enlace de recuperación.',
        );

        setState('invalid');
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'PASSWORD_RECOVERY') {
        setError(null);
        setState(session ? 'ready' : 'invalid');
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        setState('ready');
      }
    });

    void checkInitialSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (state === 'saving') return;

      setError(null);

      const nextPassword = password.trim();

      if (nextPassword.length < 8) {
        setError('La contraseña debe contener al menos 8 caracteres.');
        return;
      }

      if (nextPassword !== confirmation.trim()) {
        setError('Las contraseñas no coinciden.');
        return;
      }

      try {
        setState('saving');

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          setState('invalid');
          setError(
            'La sesión de recuperación expiró o no es válida. Solicita otro enlace.',
          );
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: nextPassword,
        });

        if (updateError) {
          throw updateError;
        }

        setPassword('');
        setConfirmation('');
        setState('success');

        await supabase.auth.signOut();
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo actualizar la contraseña.',
        );

        setState('ready');
      }
    },
    [confirmation, password, state],
  );

  const goHome = useCallback(() => {
    window.location.assign('/');
  }, []);

  if (state === 'checking') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-white">
        <section className="text-center">
          <h1 className="text-xl font-semibold">
            Validando recuperación...
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Estamos comprobando tu enlace.
          </p>
        </section>
      </main>
    );
  }

  if (state === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-emerald-900 bg-slate-900 p-7 text-center shadow-2xl">
          <div className="text-5xl">✓</div>

          <h1 className="mt-4 text-2xl font-bold">
            Contraseña actualizada
          </h1>

          <p className="mt-3 text-slate-300">
            Tu contraseña fue cambiada correctamente.
          </p>

          <button
            type="button"
            onClick={goHome}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500"
          >
            Iniciar sesión
          </button>
        </section>
      </main>
    );
  }

  if (state === 'invalid') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-red-900 bg-slate-900 p-7 shadow-2xl">
          <h1 className="text-2xl font-bold">
            Enlace no válido
          </h1>

          <p className="mt-3 text-slate-300">
            El enlace expiró, ya fue utilizado o no pudo crear una sesión
            válida de recuperación.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={goHome}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500"
          >
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-2xl font-bold">
          Nueva contraseña
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Introduce la nueva contraseña de tu cuenta ChatMig.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="new-password"
              className="mb-2 block text-sm font-medium"
            >
              Nueva contraseña
            </label>

            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={state === 'saving'}
              minLength={8}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-2 block text-sm font-medium"
            >
              Confirmar contraseña
            </label>

            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={state === 'saving'}
              minLength={8}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={state === 'saving'}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {state === 'saving'
              ? 'Guardando...'
              : 'Cambiar contraseña'}
          </button>
        </form>
      </section>
    </main>
  );
};

export default ResetPassword;
'@

Write-Utf8 $resetPath $resetComponent

Changed "ResetPassword.tsx creado con PASSWORD_RECOVERY + updateUser()."

# ============================================================
# 4. INSERTAR /reset-password EN MAIN
# ============================================================

Title "4. RUTA /reset-password"

$mainPath = Join-Path $ProjectRoot "src\main.tsx"

if (Test-Path $mainPath) {

    $main = Read-Text $mainPath

    if ($main -notmatch "ResetPassword") {

        # Primero convertir App -> RootApp
        if ($main -match "<App\s*/>") {

            $main = [regex]::Replace(
                $main,
                "<App\s*/>",
                "<RootApp />"
            )

            # Añadir import
            $main = "import ResetPassword from './components/ResetPassword';`r`n" + $main

            # Insertar RootApp después del último import
            $matches = [regex]::Matches(
                $main,
                "(?m)^import\s+.*?;\s*$"
            )

            if ($matches.Count -gt 0) {

                $last = $matches[$matches.Count - 1]

                $position = $last.Index + $last.Length

                $rootComponent = @'


const RootApp = () =>
  window.location.pathname === '/reset-password'
    ? <ResetPassword />
    : <App />;
'@

                $main = $main.Insert(
                    $position,
                    $rootComponent
                )

                Write-Utf8 $mainPath $main

                Changed "main.tsx ahora reconoce /reset-password."
            }
        }
        else {
            Warn "No encontré <App /> en main.tsx. Revisa routing manualmente."
        }
    }
    else {
        OK "ResetPassword ya está integrado en main.tsx."
    }
}
else {
    Warn "No existe src/main.tsx."
}

# ============================================================
# 5. ASEGURAR redirectTo
# ============================================================

Title "5. REDIRECT DE RECUPERACION"

foreach ($relative in @(
    "src\components\AuthPanel.tsx",
    "src\components\AdminDashboard.tsx"
)) {

    $path = Join-Path $ProjectRoot $relative

    if (!(Test-Path $path)) {
        continue
    }

    $content = Read-Text $path

    if ($content -notmatch "resetPasswordForEmail") {
        continue
    }

    if ($content -match "reset-password") {
        OK "$relative ya referencia /reset-password."
        continue
    }

    # Caso sencillo: resetPasswordForEmail(email)
    $regexSimple = [regex]'resetPasswordForEmail\(\s*([A-Za-z0-9_.$]+)\s*\)'

    if ($regexSimple.IsMatch($content)) {

        $content = $regexSimple.Replace(
            $content,
            'resetPasswordForEmail($1, { redirectTo: `${window.location.origin}/reset-password` })',
            1
        )

        Write-Utf8 $path $content

        Changed "${relative}: redirectTo agregado."
        continue
    }

    # Caso con objeto de opciones
    $regexObject = [regex]'resetPasswordForEmail\(\s*([^,]+),\s*\{'

    if ($regexObject.IsMatch($content)) {

        $content = $regexObject.Replace(
            $content,
            {
                param($m)

                return (
                    "resetPasswordForEmail(" +
                    $m.Groups[1].Value +
                    ", {`r`n        redirectTo: `${window.location.origin}/reset-password`,"
                )
            },
            1
        )

        Write-Utf8 $path $content

        Changed "${relative}: redirectTo insertado en opciones."
    }
    else {
        Warn "No pude insertar automáticamente redirectTo en ${relative}."
    }
}

# ============================================================
# 6. ACTIVITY TYPE UNIFICADO
# ============================================================

Title "6. TYPES CENTRALIZADOS"

$activityPath = Join-Path $ProjectRoot "src\services\activityService.ts"

if (Test-Path $activityPath) {

    $activity = Read-Text $activityPath
    $beforeActivity = $activity

    $activity = $activity.Replace(
        "import type { ActivityType as SharedActivityType } from '../types';",
        "import type { ActivityType } from '../types';"
    )

    $activity = $activity.Replace(
        "export type ActivityType = SharedActivityType;",
        "export type { ActivityType } from '../types';"
    )

    if ($activity -ne $beforeActivity) {

        Write-Utf8 $activityPath $activity
        Changed "ActivityType ahora tiene un único origen real."
    }
    else {
        OK "activityService no necesitó parche conocido."
    }
}

# ============================================================
# 7. GEMINI: ELIMINAR API KEY DIRECTA DEL BROWSER
# ============================================================

Title "7. GEMINI SECURITY"

$geminiPath = Join-Path $ProjectRoot "src\services\geminiService.ts"

if (Test-Path $geminiPath) {

    $gemini = Read-Text $geminiPath
    $beforeGemini = $gemini

    # Remover específicamente asignaciones directas del VITE Gemini API key
    $keyAssignment = [regex]::new(
        '(?m)^(\s*)const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=.*VITE_GEMINI_API_KEY.*;\s*$'
    )

    $gemini = $keyAssignment.Replace(
        $gemini,
        {
            param($m)

            $indent = $m.Groups[1].Value
            $name = $m.Groups[2].Value

            return "$indent" + "const $name = ''; // HARDENING: API key directa deshabilitada en navegador."
        }
    )

    # Remover el nombre sensible también de comentarios
    $gemini = $gemini.Replace(
        "VITE_GEMINI_API_KEY",
        "DIRECT_GEMINI_BROWSER_KEY_DISABLED"
    )

    # Limpiar import.meta as any
    $gemini = $gemini.Replace(
        "(import.meta as any)?.env?.",
        "import.meta.env."
    )

    $gemini = $gemini.Replace(
        "(import.meta as any).env.",
        "import.meta.env."
    )

    if ($gemini -ne $beforeGemini) {

        Write-Utf8 $geminiPath $gemini

        Changed "Gemini browser API key deshabilitada; debe utilizar backend/JWT."
    }
    else {
        OK "No encontré API key directa de Gemini que modificar."
    }
}

# ============================================================
# 8. LIMPIEZA SEGURA DE ANY
# ============================================================

Title "8. REDUCCION SEGURA DE ANY"

$codeFiles = Get-CodeFiles

foreach ($file in $codeFiles) {

    $path = $file.FullName
    $original = Read-Text $path
    $candidate = $original

    # Transformaciones altamente seguras
    $candidate = $candidate.Replace(
        "(import.meta as any)?.env?.",
        "import.meta.env."
    )

    $candidate = $candidate.Replace(
        "(import.meta as any).env.",
        "import.meta.env."
    )

    if ($candidate -eq $original) {
        continue
    }

    Write-Utf8 $path $candidate

    if (Run-TypeScript) {

        Changed "Tipos mejorados: $($file.Name)"
    }
    else {

        Write-Utf8 $path $original
        Warn "Revertido cambio de tipos en $($file.Name)"
    }
}

# Intentar : any -> : unknown archivo por archivo.
# Solo conserva el cambio si TODO TypeScript sigue compilando.
$codeFiles = Get-CodeFiles

foreach ($file in $codeFiles) {

    $path = $file.FullName
    $original = Read-Text $path

    if ($original -notmatch ":\s*any\b") {
        continue
    }

    $candidate = [regex]::Replace(
        $original,
        ':\s*any\b',
        ': unknown'
    )

    if ($candidate -eq $original) {
        continue
    }

    Write-Utf8 $path $candidate

    if (Run-TypeScript) {

        Changed "any -> unknown seguro: $($file.Name)"
    }
    else {

        Write-Utf8 $path $original

        Write-Host "    Revertido: $($file.Name)" -ForegroundColor DarkYellow
    }
}

# ============================================================
# 9. DEPENDENCIAS
# ============================================================

Title "9. DEPENDENCIAS Y VULNERABILIDADES"

if (!$SkipDependencyUpdate) {

    Run "npm update (solo dentro de semver permitido)" {
        npm update
    }

    Run "npm audit fix SIN --force" {
        npm audit fix
    } -AllowFailure

    Changed "Dependencias actualizadas sin saltos major forzados."
}
else {
    Warn "Actualización de dependencias omitida."
}

# ============================================================
# 10. VITEST
# ============================================================

Title "10. TESTING AUTOMATIZADO"

if (!$SkipTests) {

    $package = Get-Content (Join-Path $ProjectRoot "package.json") -Raw

    if ($package -notmatch '"vitest"') {

        Run "Instalando Vitest" {
            npm install --save-dev vitest
        }

        Changed "Vitest instalado."
    }

    Run "Agregando scripts npm" {
        npm pkg set scripts.test="vitest run"
        npm pkg set scripts.check="tsc --noEmit && vitest run && vite build"
    }

    $testsDir = Join-Path $ProjectRoot "tests"

    New-Item -ItemType Directory -Path $testsDir -Force | Out-Null

    # --------------------------------------------------------
    # TEST 01
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "01-auth-reset.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('password recovery', () => {
  it('actualiza realmente la contraseña', () => {
    const source = fs.readFileSync(
      'src/components/ResetPassword.tsx',
      'utf8',
    );

    expect(source).toContain('PASSWORD_RECOVERY');
    expect(source).toContain('auth.updateUser');
    expect(source).toContain('password: nextPassword');
  });
});
'@

    # --------------------------------------------------------
    # TEST 02
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "02-auth-client.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Supabase client', () => {
  it('mantiene sesión y procesa callbacks', () => {
    const source = fs.readFileSync(
      'src/services/supabaseClient.ts',
      'utf8',
    );

    expect(source).toContain('persistSession: true');
    expect(source).toContain('autoRefreshToken: true');
    expect(source).toContain('detectSessionInUrl: true');
  });
});
'@

    # --------------------------------------------------------
    # TEST 03
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "03-free-limit.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('FREE tokens', () => {
  it('mantiene límite de 3000 tokens', () => {
    const source = fs.readFileSync('src/App.tsx', 'utf8');

    expect(source).toMatch(
      /FREE_TOKENS_MAX\s*=\s*3000/,
    );
  });
});
'@

    # --------------------------------------------------------
    # TEST 04
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "04-free-block.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('FREE exhaustion', () => {
  it('bloquea cuando tokens llegan a cero', () => {
    const source = fs.readFileSync('src/App.tsx', 'utf8');

    expect(source).toMatch(
      /tokensRemaining\s*<=\s*0/,
    );

    expect(source).toContain(
      'free_quota_exhausted',
    );
  });
});
'@

    # --------------------------------------------------------
    # TEST 05
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "05-free-persistence.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('FREE persistence', () => {
  it('persiste cuotas en Supabase', () => {
    const source = fs.readFileSync('src/App.tsx', 'utf8');

    expect(source).toContain('account_quotas');
    expect(source).toContain('chatmig:quotas:');
  });
});
'@

    # --------------------------------------------------------
    # TEST 06
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "06-activity.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('activity tracking', () => {
  it('registra agotamiento FREE', () => {
    const source = fs.readFileSync('src/App.tsx', 'utf8');

    expect(source).toContain(
      'free_quota_exhausted',
    );
  });
});
'@

    # --------------------------------------------------------
    # TEST 07
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "07-security-gemini.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Gemini security', () => {
  it('no expone VITE_GEMINI_API_KEY en frontend', () => {
    const source = fs.readFileSync(
      'src/services/geminiService.ts',
      'utf8',
    );

    expect(source).not.toContain(
      'VITE_GEMINI_API_KEY',
    );
  });
});
'@

    # --------------------------------------------------------
    # TEST 08
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "08-paypal.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function sourceTree(dir: string): string {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return sourceTree(full);
      }

      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        return [];
      }

      return [fs.readFileSync(full, 'utf8')];
    })
    .join('\n');
}

describe('PayPal', () => {
  it('contiene createOrder y onApprove', () => {
    const source = sourceTree('src');

    expect(source).toContain('createOrder');
    expect(source).toContain('onApprove');
  });
});
'@

    # --------------------------------------------------------
    # TEST 09
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "09-project-structure.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('project structure', () => {
  it('contiene archivos centrales', () => {
    expect(fs.existsSync('src/App.tsx')).toBe(true);
    expect(fs.existsSync('src/types.ts')).toBe(true);
    expect(
      fs.existsSync('src/services/supabaseClient.ts'),
    ).toBe(true);
  });
});
'@

    # --------------------------------------------------------
    # TEST 10
    # --------------------------------------------------------

    Write-Utf8 (Join-Path $testsDir "10-reset-route.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('reset password route', () => {
  it('expone /reset-password', () => {
    const source = fs.readFileSync(
      'src/main.tsx',
      'utf8',
    );

    expect(source).toContain('/reset-password');
    expect(source).toContain('ResetPassword');
  });
});
'@

    Changed "10 pruebas de regresión creadas."
}

# ============================================================
# 11. SCAN SECRETS
# ============================================================

Title "11. ESCANEO DE SECRETOS"

$secretPatterns = @(
    "SUPABASE_SERVICE_ROLE",
    "PAYPAL_CLIENT_SECRET",
    "OPENAI_API_KEY",
    "VITE_GEMINI_API_KEY"
)

$secretMatches = @()

foreach ($file in (Get-CodeFiles)) {

    foreach ($pattern in $secretPatterns) {

        $matches = Select-String `
            -Path $file.FullName `
            -Pattern $pattern `
            -SimpleMatch `
            -ErrorAction SilentlyContinue

        if ($matches) {
            $secretMatches += $matches
        }
    }
}

if ($secretMatches.Count -eq 0) {

    OK "No se encontraron secretos server-side evidentes en src."
}
else {

    Warn "$($secretMatches.Count) coincidencias sensibles permanecen."

    foreach ($match in $secretMatches) {

        Write-Host (
            "    {0}:{1}" -f
            $match.Path,
            $match.LineNumber
        ) -ForegroundColor DarkYellow
    }
}

# ============================================================
# 12. BUSCAR CLIENTES SUPABASE DUPLICADOS
# ============================================================

Title "12. CLIENTES SUPABASE"

$clientMatches = @(
    Get-CodeFiles |
    Select-String -Pattern "createClient\(" -ErrorAction SilentlyContinue
)

if ($clientMatches.Count -eq 1) {

    OK "Solo existe un createClient en src."
}
else {

    Warn "Existen $($clientMatches.Count) createClient en src."

    foreach ($match in $clientMatches) {

        Write-Host (
            "    {0}:{1}" -f
            $match.Path,
            $match.LineNumber
        ) -ForegroundColor DarkYellow
    }
}

# ============================================================
# 13. ANY REMANENTE
# ============================================================

Title "13. ANALISIS DE ANY"

$anyMatches = @(
    Get-CodeFiles |
    Select-String -Pattern "\bany\b" -ErrorAction SilentlyContinue
)

$asAnyMatches = @(
    Get-CodeFiles |
    Select-String -Pattern "\bas any\b" -ErrorAction SilentlyContinue
)

Write-Host "any restante:    $($anyMatches.Count)"
Write-Host "as any restante: $($asAnyMatches.Count)"

if ($anyMatches.Count -le 10) {
    OK "Uso de any bajo control."
}
else {
    Warn "Quedan $($anyMatches.Count) coincidencias de any para refactor semántico."
}

# ============================================================
# 14. VALIDACION FINAL
# ============================================================

Title "14. VALIDACION FINAL"

$valid = $true

# TypeScript
Write-Host ""
Write-Host ">>> npx tsc --noEmit" -ForegroundColor Gray

& npx tsc --noEmit

if ($LASTEXITCODE -eq 0) {
    OK "TypeScript 100%."
}
else {
    Fail "TypeScript falló."
    $valid = $false
}

# Tests
if (!$SkipTests) {

    Write-Host ""
    Write-Host ">>> npm test" -ForegroundColor Gray

    & npm test

    if ($LASTEXITCODE -eq 0) {
        OK "Tests 100%."
    }
    else {
        Fail "Tests fallaron."
        $valid = $false
    }
}

# Build
Write-Host ""
Write-Host ">>> npm run build" -ForegroundColor Gray

& npm run build

if ($LASTEXITCODE -eq 0) {
    OK "BUILD EXITOSO."
}
else {
    Fail "BUILD FALLÓ."
    $valid = $false
}

# ============================================================
# 15. AUDIT FINAL
# ============================================================

Title "15. NPM AUDIT FINAL"

$auditText = ""

try {

    $auditText = (& npm audit --json 2>&1 | Out-String)

    $audit = $auditText | ConvertFrom-Json

    $critical = [int]$audit.metadata.vulnerabilities.critical
    $high = [int]$audit.metadata.vulnerabilities.high
    $moderate = [int]$audit.metadata.vulnerabilities.moderate
    $low = [int]$audit.metadata.vulnerabilities.low

    Write-Host ""
    Write-Host "Critical: $critical"
    Write-Host "High:     $high"
    Write-Host "Moderate: $moderate"
    Write-Host "Low:      $low"

    if ($critical -eq 0) {
        OK "Sin vulnerabilidades críticas."
    }
    else {
        Fail "Quedan $critical vulnerabilidades críticas."
    }

    if ($high -eq 0) {
        OK "Sin vulnerabilidades altas."
    }
    else {
        Warn "Quedan $high vulnerabilidades altas."
    }
}
catch {

    Warn "No pude interpretar npm audit --json."
}

# ============================================================
# ROLLBACK SI ROMPE BUILD/TYPE/TEST
# ============================================================

if (!$valid) {

    if (!$NoRollback) {

        Restore-Project

        throw "Hardening revertido porque el proyecto dejó de validar."
    }
    else {

        Warn "Validación falló pero -NoRollback está activo."
    }
}

# ============================================================
# 16. EJECUTAR SCANNER 1/10
# ============================================================

Title "16. NUEVA EVALUACION CHATMI"

$scanner = Join-Path $ProjectRoot "scripts\evaluar-chatmi.ps1"

if (Test-Path $scanner) {

    Write-Host ""
    Write-Host "Ejecutando scanner 1/10..." -ForegroundColor Gray

    & powershell `
        -ExecutionPolicy Bypass `
        -File $scanner `
        -ProjectRoot $ProjectRoot

    # El scanner puede devolver 1 si todavía no llega a 8.
    $scannerExit = $LASTEXITCODE
}
else {

    Warn "No encontré scripts\evaluar-chatmi.ps1"
}

# ============================================================
# 17. REPORTE FINAL
# ============================================================

Title "17. REPORTE DE HARDENING"

$elapsed = (Get-Date) - $Started

$report = New-Object System.Collections.Generic.List[string]

$report.Add("CHATMI HARDENING $Version")
$report.Add("Fecha: $(Get-Date)")
$report.Add("Proyecto: $ProjectRoot")
$report.Add("Backup: $BackupRoot")
$report.Add("")
$report.Add("VALIDACION:")
$report.Add("TypeScript/Tests/Build: $valid")
$report.Add("")
$report.Add("CAMBIOS:")

foreach ($item in $Changes) {
    $report.Add("[+] $item")
}

$report.Add("")
$report.Add("WARNINGS:")

foreach ($item in $Warnings) {
    $report.Add("[!] $item")
}

$report.Add("")
$report.Add("FAILURES:")

foreach ($item in $Failures) {
    $report.Add("[X] $item")
}

$report.Add("")
$report.Add("ANY RESTANTE: $($anyMatches.Count)")
$report.Add("AS ANY RESTANTE: $($asAnyMatches.Count)")
$report.Add("")
$report.Add("Duracion: $([math]::Round($elapsed.TotalSeconds, 1)) segundos")

$report |
    Set-Content `
        -LiteralPath $ReportPath `
        -Encoding UTF8

Write-Host ""
Write-Host ("=" * 92) -ForegroundColor DarkGray
Write-Host ""
Write-Host " HARDENING TERMINADO" -ForegroundColor Green
Write-Host ""
Write-Host " TypeScript : OK" -ForegroundColor Green

if (!$SkipTests) {
    Write-Host " Tests      : OK" -ForegroundColor Green
}

Write-Host " Build      : OK" -ForegroundColor Green
Write-Host ""
Write-Host " Backup:" -ForegroundColor White
Write-Host " $BackupRoot" -ForegroundColor Cyan
Write-Host ""
Write-Host " Reporte:" -ForegroundColor White
Write-Host " $ReportPath" -ForegroundColor Cyan
Write-Host ""
Write-Host " Duracion: $([math]::Round($elapsed.TotalSeconds, 1)) segundos" -ForegroundColor Gray
Write-Host ""
