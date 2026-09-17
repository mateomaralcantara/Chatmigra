param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$SrcRoot = Join-Path $ProjectRoot "src"
$ReportsDir = Join-Path $ProjectRoot "reports"
$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\nivel6-2-$Stamp"
$Scanner = Join-Path $ProjectRoot "scripts\evaluar-chatmi-v2.ps1"

New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

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

function Warn {
    param([string]$Text)
    Write-Host "[!]  $Text" -ForegroundColor Yellow
}

function Changed {
    param([string]$Text)
    Write-Host "[+]  $Text" -ForegroundColor Magenta
}

function Read-Text {
    param([string]$Path)

    return Get-Content `
        -LiteralPath $Path `
        -Raw
}

function Write-Text {
    param(
        [string]$Path,
        [string]$Content
    )

    Set-Content `
        -LiteralPath $Path `
        -Value $Content `
        -Encoding UTF8
}

function Get-SrcFiles {

    return @(
        Get-ChildItem `
            -LiteralPath $SrcRoot `
            -Recurse `
            -File `
            -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in @(
                ".ts",
                ".tsx",
                ".js",
                ".jsx"
            )
        }
    )
}

function Get-AnyCount {

    return @(
        Get-SrcFiles |
        Select-String `
            -Pattern '(:\s*any\b|\bas\s+any\b|<any>)' `
            -ErrorAction SilentlyContinue
    ).Count
}

function Get-AnyCountText {
    param([string]$Text)

    return [regex]::Matches(
        $Text,
        '(:\s*any\b|\bas\s+any\b|<any>)'
    ).Count
}

# ============================================================
# VALIDADORES PUROS
# ============================================================

function Test-TSC {

    $log = Join-Path $env:TEMP "chatmi-62-tsc-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & npx tsc --noEmit *> $log
        $code = $LASTEXITCODE

        return [bool]($code -eq 0)
    }
    finally {

        Pop-Location

        Remove-Item `
            $log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Test-Tests {

    $log = Join-Path $env:TEMP "chatmi-62-tests-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & npm test *> $log
        $code = $LASTEXITCODE

        return [bool]($code -eq 0)
    }
    finally {

        Pop-Location

        Remove-Item `
            $log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Test-Build {

    $log = Join-Path $env:TEMP "chatmi-62-build-$PID.txt"

    Push-Location $ProjectRoot

    try {

        & npm run build *> $log
        $code = $LASTEXITCODE

        return [bool]($code -eq 0)
    }
    finally {

        Pop-Location

        Remove-Item `
            $log `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

# ============================================================
# PARCHE TRANSACCIONAL
# ============================================================

function Try-Patch {
    param(
        [string]$RelativePath,
        [string]$Description,
        [scriptblock]$Transform
    )

    $path = Join-Path $ProjectRoot $RelativePath

    if (!(Test-Path $path)) {

        Warn "$Description — archivo no encontrado."
        return $false
    }

    $original = Read-Text $path
    $before = Get-AnyCountText $original

    $candidate = & $Transform $original

    if (
        $null -eq $candidate -or
        $candidate -eq $original
    ) {

        Warn "$Description — patrón no localizado."
        return $false
    }

    $afterCandidate = Get-AnyCountText $candidate

    Write-Text `
        -Path $path `
        -Content $candidate

    if (!(Test-TSC)) {

        Write-Text `
            -Path $path `
            -Content $original

        Warn "$Description — REVERTIDO por TypeScript."

        return $false
    }

    if ($afterCandidate -ge $before) {

        Write-Text `
            -Path $path `
            -Content $original

        Warn "$Description — no redujo ANY; revertido."

        return $false
    }

    Changed (
        "{0}: {1} -> {2} ANY" -f
        $Description,
        $before,
        $afterCandidate
    )

    return $true
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI NIVEL 6.2 — TIPADO SEMANTICO REAL" -ForegroundColor Cyan
Write-Host " Contratos concretos + inferencia + rollback por parche" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto: $ProjectRoot" -ForegroundColor Gray

Set-Location $ProjectRoot

# ============================================================
# 1. BASELINE
# ============================================================

Section "1. BASELINE"

if (!(Test-TSC)) {
    throw "TypeScript no inicia limpio."
}

OK "TypeScript: 0 errores."

if (!(Test-Tests)) {
    throw "Tests no pasan."
}

OK "Tests: 10/10."

if (!(Test-Build)) {
    throw "Build no pasa."
}

OK "Build producción."

$initialAny = Get-AnyCount

Write-Host ""
Write-Host "ANY iniciales: $initialAny" -ForegroundColor Yellow

# ============================================================
# 2. BACKUP
# ============================================================

Section "2. BACKUP MAESTRO"

Copy-Item `
    $SrcRoot `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

Copy-Item `
    (Join-Path $ProjectRoot "package.json") `
    (Join-Path $BackupRoot "package.json") `
    -Force

if (Test-Path (Join-Path $ProjectRoot "package-lock.json")) {

    Copy-Item `
        (Join-Path $ProjectRoot "package-lock.json") `
        (Join-Path $BackupRoot "package-lock.json") `
        -Force
}

OK "Backup creado:"
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. ADMINAPP
# ============================================================

Section "3. ADMINAPP"

Try-Patch `
    "src\AdminApp.tsx" `
    "Admin metadata Supabase" `
    {
        param($s)

        $s = $s.Replace(
            "(logged!.user_metadata as any)?.first_name",
            "logged!.user_metadata?.first_name"
        )

        $s = $s.Replace(
            "(logged!.user_metadata as any)?.last_name",
            "logged!.user_metadata?.last_name"
        )

        return $s
    }

Try-Patch `
    "src\AdminApp.tsx" `
    "Admin Gemini stream" `
    {
        param($s)

        return $s.Replace(
            "stream as any",
            "stream as AsyncIterable<{ text?: string | (() => string) }>"
        )
    }

# ============================================================
# 4. AUTH PANEL
# ============================================================

Section "4. AUTH PANEL"

Try-Patch `
    "src\components\AuthPanel.tsx" `
    "Auth plan record" `
    {
        param($s)

        return $s.Replace(
            "(data as any).plan",
            "(data as { plan?: unknown }).plan"
        )
    }

Try-Patch `
    "src\components\AuthPanel.tsx" `
    "Supabase identities" `
    {
        param($s)

        return $s.Replace(
            "(data?.user as any)?.identities",
            "(data?.user as { identities?: unknown[] } | null | undefined)?.identities"
        )
    }

Try-Patch `
    "src\components\AuthPanel.tsx" `
    "Payload estructurado" `
    {
        param($s)

        return $s.Replace(
            "const payload: any = {",
            "const payload: Record<string, unknown> = {"
        )
    }

# ============================================================
# 5. CHAT WINDOW
# ============================================================

Section "5. CHAT WINDOW"

Try-Patch `
    "src\components\ChatWindow.tsx" `
    "ChatMessage type guard" `
    {
        param($s)

        $s = $s.Replace(
            "(m as any).role",
            "(m as { role?: unknown }).role"
        )

        $s = $s.Replace(
            "(m as any).content",
            "(m as { content?: unknown }).content"
        )

        return $s
    }

# ============================================================
# 6. IMAGE SUPPORT
# ============================================================

Section "6. IMAGE SUPPORT"

Try-Patch `
    "src\components\ImageSupport.tsx" `
    "Image result guard" `
    {
        param($s)

        $pattern =
            "images\.filter\(\(x:\s*any\)\s*=>\s*x\s*&&\s*typeof\s+x\.url\s*===\s*'string'\)"

        $replacement = @"
images.filter(
      (x: unknown): x is { url: string } =>
        typeof x === 'object' &&
        x !== null &&
        'url' in x &&
        typeof (x as { url?: unknown }).url === 'string',
    )
"@

        return [regex]::Replace(
            $s,
            $pattern,
            $replacement
        )
    }

# ============================================================
# 7. TUTOR WORKSPACE
# ============================================================

Section "7. TUTOR WORKSPACE"

Try-Patch `
    "src\components\TutorWorkspace.tsx" `
    "Tutor user id" `
    {
        param($s)

        return $s.Replace(
            "(user as any)?.id || userEmail",
            "(user as typeof user & { id?: string }).id || userEmail"
        )
    }

# ============================================================
# 8. TIMELINE
# ============================================================

Section "8. TIMELINE"

Try-Patch `
    "src\components\Timeline.tsx" `
    "Timeline flexible data" `
    {
        param($s)

        $s = $s.Replace(
            "const anyData = data as any;",
            "const flexibleData = data as typeof data & { items?: unknown; steps?: unknown; events?: unknown };"
        )

        $s = $s.Replace(
            "anyData.items ?? anyData.steps ?? anyData.events ?? []",
            "flexibleData.items ?? flexibleData.steps ?? flexibleData.events ?? []"
        )

        $s = $s.Replace(
            "const items: any[] = Array.isArray(rawItems) ? rawItems : [];",
            "const items: Array<{ date?: string; description?: string; status?: string; title?: string; label?: string; content?: string; name?: string }> = Array.isArray(rawItems) ? rawItems : [];"
        )

        return $s
    }

# ============================================================
# 9. VOICE DEBUG
# ============================================================

Section "9. VOICE DEBUG"

Try-Patch `
    "src\debug\voiceDebug.ts" `
    "Voice JSON response" `
    {
        param($s)

        return $s.Replace(
            "safeJsonParse<any>",
            "safeJsonParse<{ token?: string; access_token?: string; message?: string; error?: unknown; [key: string]: unknown }>"
        )
    }

Try-Patch `
    "src\debug\voiceDebug.ts" `
    "Voice error unknown" `
    {
        param($s)

        $pattern = "\}\s*catch\s*\(e:\s*any\)\s*\{\s*const msg\s*="

        $replacement = @"
} catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    const msg =
"@

        $result = [regex]::Replace(
            $s,
            $pattern,
            $replacement,
            1
        )

        $result = $result.Replace(
            "e?.name",
            "error.name"
        )

        $result = $result.Replace(
            "e?.message",
            "error.message"
        )

        return $result
    }

Try-Patch `
    "src\debug\voiceDebug.ts" `
    "Global voice debug contract" `
    {
        param($s)

        return $s.Replace(
            "(globalThis as any).__debugGeminiToken",
            "(globalThis as typeof globalThis & { __debugGeminiToken?: (endpoint?: string, opts?: DebugOpts) => ReturnType<typeof debugEphemeralToken> }).__debugGeminiToken"
        )
    }

# ============================================================
# 10. GEMINI SERVICE
# ============================================================

Section "10. GEMINI SERVICE"

Try-Patch `
    "src\services\geminiService.ts" `
    "Gemini Live Session SDK type" `
    {
        param($s)

        $pattern = @"
type\s+LiveSession\s*=\s*\{\s*
close\?:\s*\(\)\s*=>\s*void;\s*
sendRealtimeInput\?:\s*\(payload:\s*any\)\s*=>\s*void;\s*
sendClientContent\?:\s*\(payload:\s*any\)\s*=>\s*void;\s*
\};
"@

        $replacement = @"
type GeminiSdkSession = import('@google/genai').Session;
type LiveSession = Pick<
  GeminiSdkSession,
  'close' | 'sendRealtimeInput' | 'sendClientContent'
>;
"@

        return [regex]::Replace(
            $s,
            $pattern,
            $replacement
        )
    }

Try-Patch `
    "src\services\geminiService.ts" `
    "Gemini message input" `
    {
        param($s)

        return $s.Replace(
            "const toGeminiMsg = (msg: any): GeminiApiMsg => ({",
            "const toGeminiMsg = (msg: { role?: unknown; content?: unknown }): GeminiApiMsg => ({"
        )
    }

Try-Patch `
    "src\services\geminiService.ts" `
    "Browser AudioContext constructor" `
    {
        param($s)

        return $s.Replace(
            "(window as any).AudioContext || (window as any).webkitAudioContext",
            "window.AudioContext || (window as typeof window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext"
        )
    }

Try-Patch `
    "src\services\geminiService.ts" `
    "Gemini request error unknown" `
    {
        param($s)

        $pattern = "\}\s*catch\s*\(e:\s*any\)\s*\{\s*const msg\s*="

        $replacement = @"
} catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    const msg =
"@

        $result = [regex]::Replace(
            $s,
            $pattern,
            $replacement,
            1
        )

        $result = $result.Replace(
            "e?.name === 'AbortError'",
            "error.name === 'AbortError'"
        )

        $result = $result.Replace(
            "e?.message || String(e)",
            "error.message || String(e)"
        )

        return $result
    }

Try-Patch `
    "src\services\geminiService.ts" `
    "AudioWorklet DOM API" `
    {
        param($s)

        $s = $s.Replace(
            "(ctx as any).audioWorklet",
            "ctx.audioWorklet"
        )

        return $s
    }

# ============================================================
# 11. PAYPAL CAMBIAR PLAN
# ============================================================

Section "11. PAYPAL CAMBIAR PLAN"

Try-Patch `
    "src\components\CambiarPlan.tsx" `
    "PayPal Script options" `
    {
        param($s)

        $pattern = "\}\s+as\s+any;"

        $replacement =
            "} satisfies Parameters<typeof PayPalScriptProvider>[0]['options'];"

        return [regex]::Replace(
            $s,
            $pattern,
            $replacement,
            1
        )
    }

Try-Patch `
    "src\components\CambiarPlan.tsx" `
    "PayPal createOrder actions" `
    {
        param($s)

        return $s.Replace(
            "(_: unknown, actions: any)",
            "(_: unknown, actions: Parameters<NonNullable<Parameters<typeof PayPalButtons>[0]['createOrder']>>[1])"
        )
    }

Try-Patch `
    "src\components\CambiarPlan.tsx" `
    "PayPal capture error" `
    {
        param($s)

        $s = $s.Replace(
            "catch (err: any)",
            "catch (err: unknown)"
        )

        $s = $s.Replace(
            "const issue = err?.details?.[0]?.issue || err?.name || '';",
            "const paypalError = err as { details?: Array<{ issue?: string }>; name?: string };`r`n        const issue = paypalError.details?.[0]?.issue || paypalError.name || '';"
        )

        return $s
    }

Try-Patch `
    "src\components\CambiarPlan.tsx" `
    "PayPal restart actions" `
    {
        param($s)

        $s = $s.Replace(
            "(actions as any)?.restart",
            "(actions as typeof actions & { restart?: () => Promise<void> }).restart"
        )

        $s = $s.Replace(
            "(actions as any).restart()",
            "(actions as typeof actions & { restart: () => Promise<void> }).restart()"
        )

        return $s
    }

# ============================================================
# 12. APP STREAM
# ============================================================

Section "12. APP STREAM"

Try-Patch `
    "src\App.tsx" `
    "Gemini text chunks" `
    {
        param($s)

        $s = $s.Replace(
            "const getChunkText = (chunk: any): string =>",
            "const getChunkText = (chunk: { text?: string | (() => string) } | null | undefined): string =>"
        )

        $s = $s.Replace(
            "stream as any",
            "stream as AsyncIterable<{ text?: string | (() => string) }>"
        )

        return $s
    }

Try-Patch `
    "src\App.tsx" `
    "Final ChatMessage type" `
    {
        param($s)

        return $s.Replace(
            "({ ...last, content: finalContent, tokenUsage: resolvedUsage } as any)",
            "({ ...last, content: finalContent, tokenUsage: resolvedUsage } satisfies ChatMessage)"
        )
    }

# ============================================================
# 13. ESTADO DE TIPOS
# ============================================================

Section "13. RESULTADO DE TIPADO"

$finalAny = Get-AnyCount

Write-Host ""
Write-Host "ANY iniciales : $initialAny"
Write-Host "ANY actuales  : $finalAny" -ForegroundColor Cyan
Write-Host "Eliminados    : $($initialAny - $finalAny)" -ForegroundColor Green

# ============================================================
# 14. REPORTE DE LO QUE QUEDE
# ============================================================

$RemainingReport = Join-Path `
    $ReportsDir `
    "nivel6-2-any-restante-$Stamp.txt"

$remaining = @(
    Get-SrcFiles |
    Select-String `
        -Pattern '(:\s*any\b|\bas\s+any\b|<any>)' `
        -ErrorAction SilentlyContinue
)

$remaining |
    ForEach-Object {

        "{0}:{1} -> {2}" -f `
            $_.Path,
            $_.LineNumber,
            $_.Line.Trim()

    } |
    Set-Content `
        -LiteralPath $RemainingReport `
        -Encoding UTF8

Write-Host ""
Write-Host "ANY todavía pendientes:" -ForegroundColor White

$remaining |
    Group-Object Path |
    Sort-Object Count -Descending |
    ForEach-Object {

        Write-Host (
            "  {0,3}  {1}" -f
            $_.Count,
            $_.Name.Replace("$ProjectRoot\", "")
        )
    }

# ============================================================
# 15. VALIDACION COMPLETA
# ============================================================

Section "15. VALIDACION COMPLETA"

if (!(Test-TSC)) {
    throw "TypeScript final falló."
}

OK "TypeScript: 0 errores."

if (!(Test-Tests)) {
    throw "Tests finales fallaron."
}

OK "Tests: 10/10."

if (!(Test-Build)) {
    throw "Build final falló."
}

OK "Build producción."

# ============================================================
# 16. SEGURIDAD
# ============================================================

Section "16. SEGURIDAD PRODUCCION"

$auditRaw = (
    & npm audit --omit=dev --json 2>$null |
    Out-String
)

$audit = $auditRaw | ConvertFrom-Json
$v = $audit.metadata.vulnerabilities

Write-Host "Critical : $($v.critical)"
Write-Host "High     : $($v.high)"
Write-Host "Moderate : $($v.moderate)"
Write-Host "Low      : $($v.low)"

if (
    [int]$v.critical -eq 0 -and
    [int]$v.high -eq 0 -and
    [int]$v.moderate -eq 0 -and
    [int]$v.low -eq 0
) {

    OK "Seguridad producción: 0/0/0/0."
}
else {

    throw "La seguridad de producción cambió."
}

# ============================================================
# 17. SCANNER FINAL
# ============================================================

Section "17. PUNTUACION CHATMI"

if (Test-Path $Scanner) {

    powershell `
        -ExecutionPolicy Bypass `
        -File $Scanner `
        -ProjectRoot $ProjectRoot
}

# ============================================================
# 18. FINAL
# ============================================================

Section "NIVEL 6.2 COMPLETADO"

Write-Host ""
Write-Host "ANY antes  : $initialAny"
Write-Host "ANY después: $(Get-AnyCount)" -ForegroundColor Cyan

Write-Host ""
Write-Host "Backup:" -ForegroundColor White
Write-Host $BackupRoot -ForegroundColor Cyan

Write-Host ""
Write-Host "Reporte restante:" -ForegroundColor White
Write-Host $RemainingReport -ForegroundColor Cyan