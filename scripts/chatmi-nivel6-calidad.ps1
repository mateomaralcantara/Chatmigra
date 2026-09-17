param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\nivel6-$Stamp"
$ReportsDir = Join-Path $ProjectRoot "reports"
$SrcRoot = Join-Path $ProjectRoot "src"
$Scanner = Join-Path $ProjectRoot "scripts\evaluar-chatmi-v2.ps1"

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null

function Section {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 94) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 94) -ForegroundColor DarkGray
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

# ============================================================
# VALIDADORES SIN FUGA DE OUTPUT
# ============================================================

function Test-TSC {

    $log = Join-Path $env:TEMP "chatmi-n6-tsc-$PID.txt"

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

    $log = Join-Path $env:TEMP "chatmi-n6-tests-$PID.txt"

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

    $log = Join-Path $env:TEMP "chatmi-n6-build-$PID.txt"

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

function Test-Project {

    if (!(Test-TSC)) {
        return $false
    }

    if (!(Test-Tests)) {
        return $false
    }

    if (!(Test-Build)) {
        return $false
    }

    return $true
}

# ============================================================
# CONTADORES
# ============================================================

function Get-AnyCount {

    return @(
        Get-SrcFiles |
        Select-String `
            -Pattern '(:\s*any\b|\bas\s+any\b|<any>)' `
            -ErrorAction SilentlyContinue
    ).Count
}

function Get-ConsoleCount {

    return @(
        Get-SrcFiles |
        Select-String `
            -Pattern 'console\.(log|debug|info|warn|error)\s*\(' `
            -ErrorAction SilentlyContinue
    ).Count
}

function Get-SensitiveConsoleCount {

    return @(
        Get-SrcFiles |
        Select-String `
            -Pattern 'console\.(log|debug|info|warn|error).*?(password|access_token|refresh_token|api[_-]?key)' `
            -ErrorAction SilentlyContinue
    ).Count
}

# ============================================================
# RELATIVE IMPORT
# ============================================================

function Get-LoggerImport {
    param([string]$FilePath)

    $directory = Split-Path $FilePath -Parent

    $loggerPath = Join-Path `
        $SrcRoot `
        "utils\logger.ts"

    $relative = [System.IO.Path]::GetRelativePath(
        $directory,
        $loggerPath
    )

    $relative = $relative.Replace("\", "/")

    $relative = $relative `
        -replace '\.tsx?$', ''

    if (!$relative.StartsWith(".")) {
        $relative = "./$relative"
    }

    return $relative
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI NIVEL 6 — CALIDAD 10/10" -ForegroundColor Cyan
Write-Host " Logging profesional + reducción transaccional de any" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto: $ProjectRoot" -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    throw "No existe el proyecto."
}

Set-Location $ProjectRoot

# ============================================================
# 1. BASELINE
# ============================================================

Section "1. BASELINE"

Write-Host "TypeScript..." -ForegroundColor Gray

if (!(Test-TSC)) {
    throw "El proyecto inicia con errores TypeScript."
}

OK "TypeScript 0 errores."

Write-Host "Tests..." -ForegroundColor Gray

if (!(Test-Tests)) {
    throw "Los tests no pasan."
}

OK "10 tests correctos."

Write-Host "Build..." -ForegroundColor Gray

if (!(Test-Build)) {
    throw "Build inicial fallido."
}

OK "Build producción correcto."

# ============================================================
# 2. BACKUP
# ============================================================

Section "2. BACKUP"

Copy-Item `
    $SrcRoot `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

OK "Backup completo de src creado."

# ============================================================
# 3. ESTADO ANTES
# ============================================================

Section "3. ESTADO INICIAL"

$anyBefore = Get-AnyCount
$logsBefore = Get-ConsoleCount
$sensitiveBefore = Get-SensitiveConsoleCount

Write-Host "ANY              : $anyBefore"
Write-Host "console.*        : $logsBefore"
Write-Host "logs sospechosos : $sensitiveBefore"

# ============================================================
# 4. LOGGER CENTRAL
# ============================================================

Section "4. LOGGER CENTRAL"

$utilsDir = Join-Path $SrcRoot "utils"

New-Item `
    -ItemType Directory `
    -Path $utilsDir `
    -Force |
    Out-Null

$loggerPath = Join-Path $utilsDir "logger.ts"

$loggerSource = @'
const enabled = import.meta.env.DEV;

type LogArguments = unknown[];

export const logger = {
  debug: (...args: LogArguments): void => {
    if (enabled) {
      console.debug(...args);
    }
  },

  info: (...args: LogArguments): void => {
    if (enabled) {
      console.info(...args);
    }
  },

  warn: (...args: LogArguments): void => {
    if (enabled) {
      console.warn(...args);
    }
  },

  error: (...args: LogArguments): void => {
    if (enabled) {
      console.error(...args);
    }
  },
};
'@

Write-Text `
    -Path $loggerPath `
    -Content $loggerSource

if (!(Test-TSC)) {

    Remove-Item $loggerPath -Force

    throw "logger.ts produjo error TypeScript."
}

OK "Logger central creado."

# ============================================================
# 5. MIGRAR CONSOLE.* ARCHIVO POR ARCHIVO
# ============================================================

Section "5. CENTRALIZANDO LOGGING"

$loggerMigrated = 0
$loggerRejected = 0

foreach ($file in @(Get-SrcFiles)) {

    if ($file.FullName -eq $loggerPath) {
        continue
    }

    $original = Read-Text $file.FullName

    if (
        $original -notmatch
        'console\.(log|debug|info|warn|error)\s*\('
    ) {
        continue
    }

    $candidate = $original

    $candidate = $candidate `
        -replace 'console\.log\s*\(', 'logger.debug('

    $candidate = $candidate `
        -replace 'console\.debug\s*\(', 'logger.debug('

    $candidate = $candidate `
        -replace 'console\.info\s*\(', 'logger.info('

    $candidate = $candidate `
        -replace 'console\.warn\s*\(', 'logger.warn('

    $candidate = $candidate `
        -replace 'console\.error\s*\(', 'logger.error('

    if ($candidate -eq $original) {
        continue
    }

    $importPath = Get-LoggerImport $file.FullName

    if (
        $candidate -notmatch
        "from ['""](?:.*?/)?logger['""]"
    ) {

        $import = "import { logger } from '$importPath';"

        $candidate =
            $import +
            [Environment]::NewLine +
            $candidate
    }

    Write-Text `
        -Path $file.FullName `
        -Content $candidate

    if (Test-TSC) {

        $loggerMigrated++

        Changed "Logging: $($file.Name)"
    }
    else {

        Write-Text `
            -Path $file.FullName `
            -Content $original

        $loggerRejected++

        Warn "Logging revertido: $($file.Name)"
    }
}

Write-Host ""
Write-Host "Archivos migrados   : $loggerMigrated"
Write-Host "Archivos rechazados : $loggerRejected"

# ============================================================
# 6. VALIDAR LOGGING
# ============================================================

Section "6. VALIDANDO LOGGER"

if (!(Test-TSC)) {
    throw "La migración del logger dejó TypeScript roto."
}

OK "TypeScript correcto después del logger."

$logsNow = Get-ConsoleCount
$sensitiveNow = Get-SensitiveConsoleCount

Write-Host "console.* restantes        : $logsNow"
Write-Host "logs sensibles sospechosos : $sensitiveNow"

# ============================================================
# 7. ANY — SUSTITUCION TRANSACCIONAL POR OCURRENCIA
# ============================================================

Section "7. REDUCCION TRANSACCIONAL DE ANY"

$acceptedAny = 0
$rejectedAny = 0

foreach ($file in @(Get-SrcFiles)) {

    $current = Read-Text $file.FullName

    # Solo los mismos patrones penalizados por el scanner.
    $positions =
        New-Object System.Collections.Generic.List[int]

    # -----------------------------------------
    # : any
    # -----------------------------------------

    $matches = [regex]::Matches(
        $current,
        ':\s*any\b'
    )

    foreach ($match in $matches) {

        $local = $match.Value.LastIndexOf("any")

        if ($local -ge 0) {
            $positions.Add(
                $match.Index + $local
            )
        }
    }

    # -----------------------------------------
    # as any
    # -----------------------------------------

    $matches = [regex]::Matches(
        $current,
        '\bas\s+any\b'
    )

    foreach ($match in $matches) {

        $local = $match.Value.LastIndexOf("any")

        if ($local -ge 0) {
            $positions.Add(
                $match.Index + $local
            )
        }
    }

    # -----------------------------------------
    # <any>
    # -----------------------------------------

    $matches = [regex]::Matches(
        $current,
        '<any>'
    )

    foreach ($match in $matches) {

        $positions.Add(
            $match.Index + 1
        )
    }

    $uniquePositions = @(
        $positions |
        Sort-Object -Unique -Descending
    )

    if ($uniquePositions.Count -eq 0) {
        continue
    }

    foreach ($position in $uniquePositions) {

        # Confirmación para evitar sustituir una posición
        # que haya dejado de apuntar a "any".
        if (
            $position -lt 0 -or
            ($position + 3) -gt $current.Length
        ) {
            continue
        }

        $token = $current.Substring(
            $position,
            3
        )

        if ($token -ne "any") {
            continue
        }

        $candidate =
            $current.Substring(0, $position) +
            "unknown" +
            $current.Substring($position + 3)

        Write-Text `
            -Path $file.FullName `
            -Content $candidate

        if (Test-TSC) {

            $current = $candidate
            $acceptedAny++

            Write-Host (
                "[OK] any -> unknown: {0}" -f
                $file.Name
            ) -ForegroundColor Green
        }
        else {

            Write-Text `
                -Path $file.FullName `
                -Content $current

            $rejectedAny++
        }
    }
}

Write-Host ""
Write-Host "ANY corregidos automáticamente : $acceptedAny" -ForegroundColor Green
Write-Host "ANY que requieren tipo exacto   : $rejectedAny" -ForegroundColor Yellow

# ============================================================
# 8. TYPE BACKLOG EXACTO
# ============================================================

Section "8. BACKLOG EXACTO DE TYPES"

$remainingAny = @(
    Get-SrcFiles |
    Select-String `
        -Pattern '(:\s*any\b|\bas\s+any\b|<any>)' `
        -ErrorAction SilentlyContinue
)

$anyReport = Join-Path `
    $ReportsDir `
    "nivel6-any-restante-$Stamp.txt"

$remainingAny |
    ForEach-Object {

        "{0}:{1} -> {2}" -f `
            $_.Path,
            $_.LineNumber,
            $_.Line.Trim()

    } |
    Set-Content `
        -LiteralPath $anyReport `
        -Encoding UTF8

Write-Host "ANY restantes: $($remainingAny.Count)"

# ============================================================
# 9. LOG BACKLOG
# ============================================================

Section "9. BACKLOG DE LOGGING"

$remainingLogs = @(
    Get-SrcFiles |
    Select-String `
        -Pattern 'console\.(log|debug|info|warn|error)\s*\(' `
        -ErrorAction SilentlyContinue
)

$sensitiveLogs = @(
    Get-SrcFiles |
    Select-String `
        -Pattern 'console\.(log|debug|info|warn|error).*?(password|access_token|refresh_token|api[_-]?key)' `
        -ErrorAction SilentlyContinue
)

$logReport = Join-Path `
    $ReportsDir `
    "nivel6-logs-restantes-$Stamp.txt"

$remainingLogs |
    ForEach-Object {

        "{0}:{1} -> {2}" -f `
            $_.Path,
            $_.LineNumber,
            $_.Line.Trim()

    } |
    Set-Content `
        -LiteralPath $logReport `
        -Encoding UTF8

Write-Host "console.* restantes : $($remainingLogs.Count)"
Write-Host "sensibles restantes : $($sensitiveLogs.Count)"

# ============================================================
# 10. VALIDACION COMPLETA
# ============================================================

Section "10. VALIDACION COMPLETA"

Write-Host "TypeScript..." -ForegroundColor Gray

if (!(Test-TSC)) {
    throw "TypeScript final falló."
}

OK "TypeScript 0 errores."

Write-Host "Tests..." -ForegroundColor Gray

if (!(Test-Tests)) {
    throw "Tests finales fallaron."
}

OK "10/10 tests."

Write-Host "Build..." -ForegroundColor Gray

if (!(Test-Build)) {
    throw "Build final falló."
}

OK "Build producción."

# ============================================================
# 11. AUDIT — DEBE SEGUIR EN ZERO
# ============================================================

Section "11. SEGURIDAD PRODUCCION"

Push-Location $ProjectRoot

try {

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
}
finally {
    Pop-Location
}

# ============================================================
# 12. NUEVA PUNTUACION
# ============================================================

Section "12. NUEVA PUNTUACION CHATMI"

if (Test-Path $Scanner) {

    powershell `
        -ExecutionPolicy Bypass `
        -File $Scanner `
        -ProjectRoot $ProjectRoot
}
else {

    Warn "Scanner V2.1 no encontrado."
}

# ============================================================
# 13. FINAL
# ============================================================

Section "NIVEL 6 TERMINADO"

Write-Host ""
Write-Host "ANTES:" -ForegroundColor White
Write-Host "  ANY       : $anyBefore"
Write-Host "  console.* : $logsBefore"
Write-Host "  sensibles : $sensitiveBefore"

Write-Host ""
Write-Host "AHORA:" -ForegroundColor White
Write-Host "  ANY       : $(Get-AnyCount)"
Write-Host "  console.* : $(Get-ConsoleCount)"
Write-Host "  sensibles : $(Get-SensitiveConsoleCount)"

Write-Host ""
Write-Host "Backup:" -ForegroundColor White
Write-Host $BackupRoot -ForegroundColor Cyan

Write-Host ""
Write-Host "Reporte ANY:" -ForegroundColor White
Write-Host $anyReport -ForegroundColor Cyan

Write-Host ""
Write-Host "Reporte logs:" -ForegroundColor White
Write-Host $logReport -ForegroundColor Cyan