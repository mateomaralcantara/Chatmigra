param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi",
    [switch]$SkipAuditFix = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Version = "3.0.0"
$StartedAt = Get-Date
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\v3-$Stamp"
$ReportsDir = Join-Path $ProjectRoot "reports"
$ReportPath = Join-Path $ReportsDir "hardening-v3-$Stamp.txt"

$Changes = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]

# ============================================================
# UI
# ============================================================

function Title {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 92) -ForegroundColor DarkGray
    Write-Host (" {0}" -f $Text) -ForegroundColor Cyan
    Write-Host ("=" * 92) -ForegroundColor DarkGray
}

function OK {
    param([string]$Text)
    Write-Host ("[OK] {0}" -f $Text) -ForegroundColor Green
}

function Warn {
    param([string]$Text)

    Write-Host ("[!]  {0}" -f $Text) -ForegroundColor Yellow
    $script:Warnings.Add($Text) | Out-Null
}

function Changed {
    param([string]$Text)

    Write-Host ("[+]  {0}" -f $Text) -ForegroundColor Magenta
    $script:Changes.Add($Text) | Out-Null
}

function Fail {
    param([string]$Text)

    Write-Host ("[X]  {0}" -f $Text) -ForegroundColor Red
}

# ============================================================
# FILE HELPERS
# ============================================================

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

    $parent = Split-Path $Path -Parent

    if ($parent -and !(Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    Set-Content `
        -LiteralPath $Path `
        -Value $Content `
        -Encoding UTF8
}

function Get-CodeFiles {

    $src = Join-Path $ProjectRoot "src"

    return @(
        Get-ChildItem $src -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in ".ts", ".tsx", ".js", ".jsx"
        }
    )
}

# ============================================================
# COMMAND VALIDATORS
# ============================================================

function Test-TypeScript {

    $output = & npx tsc --noEmit 2>&1
    $code = $LASTEXITCODE

    return [PSCustomObject]@{
        Success = ($code -eq 0)
        Code    = $code
        Output  = @($output)
    }
}

function Test-Build {

    $output = & npm run build 2>&1
    $code = $LASTEXITCODE

    return [PSCustomObject]@{
        Success = ($code -eq 0)
        Code    = $code
        Output  = @($output)
    }
}

function Test-Tests {

    $output = & npm test 2>&1
    $code = $LASTEXITCODE

    return [PSCustomObject]@{
        Success = ($code -eq 0)
        Code    = $code
        Output  = @($output)
    }
}

function Show-LastOutput {
    param(
        [object[]]$Output,
        [int]$Count = 40
    )

    $Output |
        Select-Object -Last $Count |
        ForEach-Object {
            Write-Host ("    {0}" -f $_) -ForegroundColor DarkYellow
        }
}

# ============================================================
# ROLLBACK
# ============================================================

function Restore-Backup {

    Title "ROLLBACK"

    Write-Host "Restaurando:" -ForegroundColor Yellow
    Write-Host $BackupRoot -ForegroundColor Gray

    $backupSrc = Join-Path $BackupRoot "src"
    $targetSrc = Join-Path $ProjectRoot "src"

    if (Test-Path $targetSrc) {
        Remove-Item $targetSrc -Recurse -Force
    }

    Copy-Item $backupSrc $targetSrc -Recurse -Force

    foreach ($file in @(
        "package.json",
        "package-lock.json"
    )) {

        $backupFile = Join-Path $BackupRoot $file
        $targetFile = Join-Path $ProjectRoot $file

        if (Test-Path $backupFile) {
            Copy-Item $backupFile $targetFile -Force
        }
    }

    $backupTests = Join-Path $BackupRoot "tests"
    $targetTests = Join-Path $ProjectRoot "tests"

    if (Test-Path $targetTests) {
        Remove-Item $targetTests -Recurse -Force
    }

    if (Test-Path $backupTests) {
        Copy-Item $backupTests $targetTests -Recurse -Force
    }

    Set-Location $ProjectRoot

    Write-Host ""
    Write-Host "Restaurando dependencias..." -ForegroundColor Gray

    npm install | Out-Host

    OK "Proyecto restaurado."
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host (" CHATMI HARDENING {0}" -f $Version) -ForegroundColor Cyan
Write-Host " Hardening seguro con validacion real por etapas" -ForegroundColor White
Write-Host ""
Write-Host (" Proyecto: {0}" -f $ProjectRoot) -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    throw "No existe ProjectRoot."
}

if (!(Test-Path (Join-Path $ProjectRoot "package.json"))) {
    throw "No existe package.json."
}

if (!(Test-Path (Join-Path $ProjectRoot "src"))) {
    throw "No existe src."
}

Set-Location $ProjectRoot

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null

# ============================================================
# 1. BASELINE
# ============================================================

Title "1. VALIDACION DEL PROYECTO ORIGINAL"

$baselineTS = Test-TypeScript

if (!$baselineTS.Success) {

    Fail "El proyecto original ya tiene errores TypeScript."

    Show-LastOutput $baselineTS.Output 60

    throw "Corrige primero el baseline antes del hardening."
}

OK "TypeScript original sin errores."

$baselineBuild = Test-Build

if (!$baselineBuild.Success) {

    Fail "El build original ya está roto."

    Show-LastOutput $baselineBuild.Output 60

    throw "Build original fallido."
}

OK "Build original exitoso."

# ============================================================
# 2. BACKUP
# ============================================================

Title "2. BACKUP"

Copy-Item `
    (Join-Path $ProjectRoot "src") `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

foreach ($file in @(
    "package.json",
    "package-lock.json"
)) {

    $source = Join-Path $ProjectRoot $file

    if (Test-Path $source) {
        Copy-Item $source (Join-Path $BackupRoot $file) -Force
    }
}

$tests = Join-Path $ProjectRoot "tests"

if (Test-Path $tests) {
    Copy-Item $tests (Join-Path $BackupRoot "tests") -Recurse -Force
}

OK ("Backup: {0}" -f $BackupRoot)

# ============================================================
# 3. NPM AUDIT FIX
# IMPORTANTE: NO npm update
# ============================================================

Title "3. DEPENDENCIAS"

if (!$SkipAuditFix) {

    Write-Host ""
    Write-Host "Ejecutando npm audit fix SIN --force..." -ForegroundColor Gray

    $auditFixOutput = & npm audit fix 2>&1
    $auditFixCode = $LASTEXITCODE

    $auditFixOutput | Out-Host

    # npm audit puede terminar != 0 si quedan advisories.
    # Lo importante es verificar que el proyecto siga compilando.

    $afterAuditTS = Test-TypeScript
    $afterAuditBuild = Test-Build

    if (!$afterAuditTS.Success -or !$afterAuditBuild.Success) {

        Warn "npm audit fix alteró la compatibilidad. Restaurando package files."

        Copy-Item `
            (Join-Path $BackupRoot "package.json") `
            (Join-Path $ProjectRoot "package.json") `
            -Force

        if (Test-Path (Join-Path $BackupRoot "package-lock.json")) {

            Copy-Item `
                (Join-Path $BackupRoot "package-lock.json") `
                (Join-Path $ProjectRoot "package-lock.json") `
                -Force
        }

        npm install | Out-Host

        Warn "Dependencias restauradas."
    }
    else {

        Changed "npm audit fix aplicado sin romper TypeScript/build."
    }
}
else {

    Warn "npm audit fix omitido."
}

# ============================================================
# 4. SUPABASE CLIENT
# ============================================================

Title "4. SUPABASE"

$supabasePath = Join-Path $ProjectRoot "src\services\supabaseClient.ts"

if (!(Test-Path $supabasePath)) {
    Restore-Backup
    throw "No existe supabaseClient.ts"
}

$supabaseText = Read-Text $supabasePath
$supabaseOriginal = $supabaseText

$supabaseText = $supabaseText.Replace(
    "(import.meta as any)?.env?.DEV",
    "import.meta.env.DEV"
)

$supabaseText = $supabaseText.Replace(
    "(import.meta as any).env.DEV",
    "import.meta.env.DEV"
)

if ($supabaseText -ne $supabaseOriginal) {

    Write-Utf8 $supabasePath $supabaseText

    $check = Test-TypeScript

    if ($check.Success) {

        Changed "supabaseClient.ts tipado sin any innecesario."
    }
    else {

        Write-Utf8 $supabasePath $supabaseOriginal
        Warn "Cambio Supabase revertido porque TypeScript no lo aceptó."
    }
}

foreach ($token in @(
    "persistSession",
    "autoRefreshToken",
    "detectSessionInUrl"
)) {

    $current = Read-Text $supabasePath

    if ($current.Contains($token)) {
        OK ("Supabase: {0}" -f $token)
    }
    else {
        Warn ("Supabase no contiene {0}" -f $token)
    }
}

# ============================================================
# 5. RESET PASSWORD
# ============================================================

Title "5. RECUPERACION DE CONTRASEÑA"

$resetPath = Join-Path $ProjectRoot "src\components\ResetPassword.tsx"

$resetSource = @'
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
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          console.error(
            '[PasswordRecovery] session:',
            sessionError.message,
          );
        }

        if (session) {
          setState('ready');
          return;
        }

        window.setTimeout(async () => {
          const {
            data: { session: delayedSession },
          } = await supabase.auth.getSession();

          if (!mounted) return;

          setState(delayedSession ? 'ready' : 'invalid');
        }, 1200);
      } catch (err: unknown) {
        if (!mounted) return;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo validar la recuperación.',
        );

        setState('invalid');
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setError(null);
        setState(session ? 'ready' : 'invalid');
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        setState('ready');
      }
    });

    void checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const updatePassword = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (state === 'saving') return;

      setError(null);

      const cleanPassword = password.trim();
      const cleanConfirmation = confirmation.trim();

      if (cleanPassword.length < 8) {
        setError(
          'La contraseña debe tener al menos 8 caracteres.',
        );
        return;
      }

      if (cleanPassword !== cleanConfirmation) {
        setError('Las contraseñas no coinciden.');
        return;
      }

      setState('saving');

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          setError(
            'La sesión de recuperación expiró. Solicita un nuevo enlace.',
          );
          setState('invalid');
          return;
        }

        const { error: updateError } =
          await supabase.auth.updateUser({
            password: cleanPassword,
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
            : 'No se pudo cambiar la contraseña.',
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
      <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 text-white">
        <section className="text-center">
          <h1 className="text-xl font-semibold">
            Validando recuperación...
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            ChatMig está verificando tu enlace.
          </p>
        </section>
      </main>
    );
  }

  if (state === 'invalid') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-red-900/50 bg-slate-900 p-7 shadow-2xl">
          <h1 className="text-2xl font-bold">
            Enlace no válido
          </h1>

          <p className="mt-3 text-slate-300">
            El enlace expiró, ya fue utilizado o no creó una
            sesión válida.
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
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  if (state === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-emerald-900/50 bg-slate-900 p-7 text-center shadow-2xl">
          <div className="text-5xl">
            ✓
          </div>

          <h1 className="mt-4 text-2xl font-bold">
            Contraseña actualizada
          </h1>

          <p className="mt-3 text-slate-300">
            Ya puedes ingresar usando tu nueva contraseña.
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-2xl font-bold">
          Crear nueva contraseña
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Introduce la nueva contraseña de tu cuenta ChatMig.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={updatePassword}
        >
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              Nueva contraseña
            </label>

            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              disabled={state === 'saving'}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="confirmation"
              className="mb-2 block text-sm font-medium"
            >
              Confirmar contraseña
            </label>

            <input
              id="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmation}
              disabled={state === 'saving'}
              onChange={(event) =>
                setConfirmation(event.target.value)
              }
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
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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

Write-Utf8 $resetPath $resetSource

Changed "ResetPassword.tsx instalado."

# ============================================================
# 6. MAIN.TSX EXACTO PARA TU ARQUITECTURA
# ============================================================

Title "6. ROUTING PRINCIPAL"

$mainPath = Join-Path $ProjectRoot "src\main.tsx"

if (!(Test-Path $mainPath)) {
    Restore-Backup
    throw "No existe src/main.tsx"
}

$mainSource = @'
// src/main.tsx
import './index.css';
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import AuthWrapper from './AuthWrapper';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento root');
}

const path = window.location.pathname;

// Lazy loading para evitar cargar paneles que el usuario no necesita.
const AdminAppLazy = React.lazy(() => import('./AdminApp'));

const ResetPasswordLazy = React.lazy(
  () => import('./components/ResetPassword'),
);

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <span>Cargando...</span>
  </div>
);

createRoot(rootElement).render(
  <React.StrictMode>
    {path.startsWith('/admin') ? (
      <Suspense fallback={<LoadingFallback />}>
        <AdminAppLazy />
      </Suspense>
    ) : path === '/reset-password' ? (
      <Suspense fallback={<LoadingFallback />}>
        <ResetPasswordLazy />
      </Suspense>
    ) : (
      <AuthWrapper />
    )}
  </React.StrictMode>,
);
'@

Write-Utf8 $mainPath $mainSource

Changed "main.tsx actualizado: admin + reset-password + AuthWrapper."

# ============================================================
# 7. VALIDAR AUTH INMEDIATAMENTE
# ============================================================

Title "7. VALIDACION AUTH"

$authTS = Test-TypeScript

if (!$authTS.Success) {

    Fail "La integración Auth produjo errores TypeScript."

    Show-LastOutput $authTS.Output 80

    Restore-Backup

    throw "Rollback por fallo de Auth."
}

OK "Recovery + routing compilan."

# ============================================================
# 8. REDUCIR ANY DE FORMA REALMENTE SEGURA
# ============================================================

Title "8. TYPING SEGURO"

$codeFiles = Get-CodeFiles

foreach ($file in $codeFiles) {

    $original = Read-Text $file.FullName
    $candidate = $original

    # Solo expresiones concretas cuyo reemplazo es semánticamente seguro.
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

    Write-Utf8 $file.FullName $candidate

    $result = Test-TypeScript

    if ($result.Success) {

        Changed (
            "Tipado seguro aplicado en {0}" -f
            $file.Name
        )
    }
    else {

        Write-Utf8 $file.FullName $original

        Warn (
            "Cambio de typing revertido en {0}" -f
            $file.Name
        )
    }
}

# ============================================================
# 9. VITEST
# ============================================================

Title "9. TESTS AUTOMATIZADOS"

$packageText = Read-Text (Join-Path $ProjectRoot "package.json")

if ($packageText -notmatch '"vitest"') {

    Write-Host "Instalando Vitest..." -ForegroundColor Gray

    npm install --save-dev vitest | Out-Host

    if ($LASTEXITCODE -ne 0) {
        Restore-Backup
        throw "No se pudo instalar Vitest."
    }

    Changed "Vitest instalado."
}

npm pkg set scripts.test="vitest run" | Out-Null

$testsDir = Join-Path $ProjectRoot "tests"

New-Item -ItemType Directory -Path $testsDir -Force | Out-Null

# 01
Write-Utf8 (Join-Path $testsDir "01-reset.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Password Recovery', () => {
  it('implementa PASSWORD_RECOVERY y updateUser', () => {
    const source = fs.readFileSync(
      'src/components/ResetPassword.tsx',
      'utf8',
    );

    expect(source).toContain('PASSWORD_RECOVERY');
    expect(source).toContain('auth.updateUser');
    expect(source).toContain('password: cleanPassword');
  });
});
'@

# 02
Write-Utf8 (Join-Path $testsDir "02-reset-route.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Reset route', () => {
  it('expone /reset-password desde main', () => {
    const source = fs.readFileSync(
      'src/main.tsx',
      'utf8',
    );

    expect(source).toContain('/reset-password');
    expect(source).toContain('ResetPasswordLazy');
    expect(source).toContain('<AuthWrapper />');
  });
});
'@

# 03
Write-Utf8 (Join-Path $testsDir "03-supabase.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Supabase client', () => {
  it('tiene persistencia y callback URL', () => {
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

# 04
Write-Utf8 (Join-Path $testsDir "04-free-limit.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('FREE Plan', () => {
  it('conserva 3000 tokens', () => {
    const source = fs.readFileSync(
      'src/App.tsx',
      'utf8',
    );

    expect(source).toMatch(
      /FREE_TOKENS_MAX\s*=\s*3000/,
    );
  });
});
'@

# 05
Write-Utf8 (Join-Path $testsDir "05-free-block.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('FREE Block', () => {
  it('bloquea cuota agotada', () => {
    const source = fs.readFileSync(
      'src/App.tsx',
      'utf8',
    );

    expect(source).toMatch(
      /tokensRemaining\s*<=\s*0/,
    );

    expect(source).toContain(
      'free_quota_exhausted',
    );
  });
});
'@

# 06
Write-Utf8 (Join-Path $testsDir "06-free-persistence.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Quota persistence', () => {
  it('usa Supabase y cache local', () => {
    const source = fs.readFileSync(
      'src/App.tsx',
      'utf8',
    );

    expect(source).toContain('account_quotas');
    expect(source).toContain('chatmig:quotas:');
  });
});
'@

# 07
Write-Utf8 (Join-Path $testsDir "07-login.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Login', () => {
  it('usa signInWithPassword', () => {
    const source = fs.readFileSync(
      'src/components/AuthPanel.tsx',
      'utf8',
    );

    expect(source).toContain(
      'signInWithPassword',
    );
  });
});
'@

# 08
Write-Utf8 (Join-Path $testsDir "08-reset-email.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Password email', () => {
  it('usa resetPasswordForEmail y reset-password', () => {
    const source = fs.readFileSync(
      'src/components/AuthPanel.tsx',
      'utf8',
    );

    expect(source).toContain(
      'resetPasswordForEmail',
    );

    expect(source).toContain(
      '/reset-password',
    );
  });
});
'@

# 09
Write-Utf8 (Join-Path $testsDir "09-paypal.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const readTree = (directory: string): string =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return readTree(full);
      }

      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        return [];
      }

      return [fs.readFileSync(full, 'utf8')];
    })
    .join('\n');

describe('PayPal', () => {
  it('conserva createOrder y onApprove', () => {
    const source = readTree('src');

    expect(source).toContain('createOrder');
    expect(source).toContain('onApprove');
  });
});
'@

# 10
Write-Utf8 (Join-Path $testsDir "10-project.test.ts") @'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('ChatMig structure', () => {
  it('conserva componentes principales', () => {
    expect(fs.existsSync('src/App.tsx')).toBe(true);

    expect(
      fs.existsSync('src/AuthWrapper.tsx'),
    ).toBe(true);

    expect(
      fs.existsSync(
        'src/services/supabaseClient.ts',
      ),
    ).toBe(true);

    expect(
      fs.existsSync(
        'src/components/ResetPassword.tsx',
      ),
    ).toBe(true);
  });
});
'@

Changed "10 pruebas instaladas."

# ============================================================
# 10. FINAL TYPESCRIPT
# ============================================================

Title "10. TYPESCRIPT FINAL"

$finalTS = Test-TypeScript

if (!$finalTS.Success) {

    Fail "TypeScript final falló."

    Show-LastOutput $finalTS.Output 100

    Restore-Backup

    throw "Rollback por TypeScript."
}

OK "TypeScript: 0 errores."

# ============================================================
# 11. TESTS FINAL
# ============================================================

Title "11. TESTS FINAL"

$finalTests = Test-Tests

$finalTests.Output | Out-Host

if (!$finalTests.Success) {

    Fail "Algún test falló."

    Restore-Backup

    throw "Rollback por tests."
}

OK "Todos los tests pasaron."

# ============================================================
# 12. BUILD
# ============================================================

Title "12. BUILD PRODUCCION"

$finalBuild = Test-Build

$finalBuild.Output | Out-Host

if (!$finalBuild.Success) {

    Fail "Build final falló."

    Restore-Backup

    throw "Rollback por build."
}

OK "Build de producción exitoso."

# ============================================================
# 13. AUDIT GENERAL
# ============================================================

Title "13. AUDIT GENERAL"

$auditRaw = & npm audit --json 2>$null | Out-String

try {

    $audit = $auditRaw | ConvertFrom-Json

    $v = $audit.metadata.vulnerabilities

    Write-Host ("Critical : {0}" -f $v.critical)
    Write-Host ("High     : {0}" -f $v.high)
    Write-Host ("Moderate : {0}" -f $v.moderate)
    Write-Host ("Low      : {0}" -f $v.low)

}
catch {

    Warn "No se pudo interpretar npm audit general."
}

# ============================================================
# 14. AUDIT PRODUCCION
# ============================================================

Title "14. AUDIT PRODUCCION"

$prodAuditRaw = & npm audit --omit=dev --json 2>$null | Out-String

try {

    $prodAudit = $prodAuditRaw | ConvertFrom-Json

    $pv = $prodAudit.metadata.vulnerabilities

    Write-Host ("Production Critical : {0}" -f $pv.critical)
    Write-Host ("Production High     : {0}" -f $pv.high)
    Write-Host ("Production Moderate : {0}" -f $pv.moderate)
    Write-Host ("Production Low      : {0}" -f $pv.low)

}
catch {

    Warn "No se pudo interpretar audit de producción."
}

# ============================================================
# 15. TYPE BACKLOG
# ============================================================

Title "15. TYPE BACKLOG"

$anyMatches = @(
    Get-CodeFiles |
    Select-String `
        -Pattern "\bany\b" `
        -ErrorAction SilentlyContinue
)

$asAnyMatches = @(
    Get-CodeFiles |
    Select-String `
        -Pattern "\bas any\b" `
        -ErrorAction SilentlyContinue
)

Write-Host ("any restante    : {0}" -f $anyMatches.Count)
Write-Host ("as any restante : {0}" -f $asAnyMatches.Count)

$typeReport = Join-Path `
    $ReportsDir `
    ("typing-backlog-{0}.txt" -f $Stamp)

@(
    "CHATMI TYPE BACKLOG"
    "==================="
    ""
    ("ANY: {0}" -f $anyMatches.Count)
    ("AS ANY: {0}" -f $asAnyMatches.Count)
    ""
) | Set-Content $typeReport -Encoding UTF8

foreach ($match in $anyMatches) {

    Add-Content `
        -Path $typeReport `
        -Value (
            "{0}:{1} -> {2}" -f
            $match.Path,
            $match.LineNumber,
            $match.Line.Trim()
        )
}

OK ("Typing report: {0}" -f $typeReport)

# ============================================================
# 16. SCANNER
# ============================================================

Title "16. SCANNER 1/10"

$scanner = Join-Path `
    $ProjectRoot `
    "scripts\evaluar-chatmi.ps1"

if (Test-Path $scanner) {

    & powershell `
        -ExecutionPolicy Bypass `
        -File $scanner `
        -ProjectRoot $ProjectRoot

}
else {

    Warn "No encontré evaluar-chatmi.ps1"
}

# ============================================================
# 17. REPORT
# ============================================================

Title "17. REPORTE"

$elapsed = (Get-Date) - $StartedAt

$report = New-Object System.Collections.Generic.List[string]

$report.Add("CHATMI HARDENING $Version")
$report.Add("========================")
$report.Add("")
$report.Add(("Fecha: {0}" -f (Get-Date)))
$report.Add(("Proyecto: {0}" -f $ProjectRoot))
$report.Add(("Backup: {0}" -f $BackupRoot))
$report.Add("")
$report.Add("CAMBIOS")
$report.Add("-------")

foreach ($item in $Changes) {
    $report.Add(("[+] {0}" -f $item))
}

$report.Add("")
$report.Add("WARNINGS")
$report.Add("--------")

foreach ($item in $Warnings) {
    $report.Add(("[!] {0}" -f $item))
}

$report.Add("")
$report.Add(("ANY restante: {0}" -f $anyMatches.Count))
$report.Add(("AS ANY restante: {0}" -f $asAnyMatches.Count))
$report.Add("")
$report.Add(
    (
        "Duracion: {0} segundos" -f
        [math]::Round($elapsed.TotalSeconds, 1)
    )
)

$report |
    Set-Content `
        -LiteralPath $ReportPath `
        -Encoding UTF8

Write-Host ""
Write-Host ("=" * 92) -ForegroundColor DarkGray
Write-Host ""
Write-Host " CHATMI HARDENING V3 COMPLETADO" -ForegroundColor Green
Write-Host ""
Write-Host " TypeScript : OK" -ForegroundColor Green
Write-Host " Tests      : OK" -ForegroundColor Green
Write-Host " Build      : OK" -ForegroundColor Green
Write-Host ""
Write-Host (" Backup  : {0}" -f $BackupRoot) -ForegroundColor Cyan
Write-Host (" Reporte : {0}" -f $ReportPath) -ForegroundColor Cyan
Write-Host ""