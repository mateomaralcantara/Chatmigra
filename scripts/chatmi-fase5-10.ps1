param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Version = "5.0.0"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\fase5-$Stamp"
$ReportsDir = Join-Path $ProjectRoot "reports"
$Scanner = Join-Path $ProjectRoot "scripts\evaluar-chatmi-v2.ps1"

# ============================================================
# UI
# ============================================================

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

function Fail {
    param([string]$Text)
    Write-Host "[X]  $Text" -ForegroundColor Red
}

function Changed {
    param([string]$Text)
    Write-Host "[+]  $Text" -ForegroundColor Magenta
}

# ============================================================
# FILES
# ============================================================

function Read-Text {
    param([string]$Path)

    if (!(Test-Path -LiteralPath $Path)) {
        return ""
    }

    return Get-Content -LiteralPath $Path -Raw
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

    $src = Join-Path $ProjectRoot "src"

    return @(
        Get-ChildItem `
            -LiteralPath $src `
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

# ============================================================
# PACKAGE BACKUP
# ============================================================

function Backup-Packages {
    param([string]$Destination)

    New-Item `
        -ItemType Directory `
        -Path $Destination `
        -Force |
        Out-Null

    Copy-Item `
        (Join-Path $ProjectRoot "package.json") `
        (Join-Path $Destination "package.json") `
        -Force

    $lock = Join-Path $ProjectRoot "package-lock.json"

    if (Test-Path $lock) {
        Copy-Item `
            $lock `
            (Join-Path $Destination "package-lock.json") `
            -Force
    }
}

function Restore-Packages {
    param([string]$Source)

    Copy-Item `
        (Join-Path $Source "package.json") `
        (Join-Path $ProjectRoot "package.json") `
        -Force

    $backupLock = Join-Path $Source "package-lock.json"

    if (Test-Path $backupLock) {
        Copy-Item `
            $backupLock `
            (Join-Path $ProjectRoot "package-lock.json") `
            -Force
    }

    Push-Location $ProjectRoot

    try {
        npm install | Out-Host

        if ($LASTEXITCODE -ne 0) {
            throw "npm install falló durante rollback."
        }
    }
    finally {
        Pop-Location
    }
}

# ============================================================
# VALIDATION
# ============================================================

function Test-TypeScript {

    Push-Location $ProjectRoot

    try {
        & npx tsc --noEmit

        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Test-Tests {

    Push-Location $ProjectRoot

    try {
        & npm test

        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Test-Build {

    Push-Location $ProjectRoot

    try {
        & npm run build

        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Test-Project {

    Write-Host ""
    Write-Host "TypeScript..." -ForegroundColor DarkGray

    if (!(Test-TypeScript)) {
        return $false
    }

    Write-Host "Tests..." -ForegroundColor DarkGray

    if (!(Test-Tests)) {
        return $false
    }

    Write-Host "Build..." -ForegroundColor DarkGray

    if (!(Test-Build)) {
        return $false
    }

    return $true
}

# ============================================================
# AUDIT
# ============================================================

function Get-AuditState {

    Push-Location $ProjectRoot

    try {

        $raw = (
            & npm audit --omit=dev --json 2>$null |
            Out-String
        )

        try {
            $audit = $raw | ConvertFrom-Json
        }
        catch {

            return [PSCustomObject]@{
                Critical = 999
                High = 999
                Moderate = 999
                Low = 999
                Score = 999999
                Names = @()
                Object = $null
            }
        }

        $v = $audit.metadata.vulnerabilities

        $names = New-Object System.Collections.Generic.List[string]

        if ($null -ne $audit.vulnerabilities) {

            foreach (
                $property in
                $audit.vulnerabilities.PSObject.Properties
            ) {

                $severity = [string]$property.Value.severity

                if (
                    $severity -in @(
                        "critical",
                        "high",
                        "moderate",
                        "low"
                    )
                ) {
                    $names.Add($property.Name) | Out-Null
                }
            }
        }

        $critical = [int]$v.critical
        $high = [int]$v.high
        $moderate = [int]$v.moderate
        $low = [int]$v.low

        $score =
            ($critical * 10000) +
            ($high * 1000) +
            ($moderate * 100) +
            ($low * 10)

        return [PSCustomObject]@{
            Critical = $critical
            High = $high
            Moderate = $moderate
            Low = $low
            Score = $score
            Names = @($names)
            Object = $audit
        }
    }
    finally {
        Pop-Location
    }
}

function Show-AuditState {
    param(
        [string]$Title,
        [object]$State
    )

    Write-Host ""
    Write-Host "$Title" -ForegroundColor Yellow
    Write-Host "  Critical : $($State.Critical)"
    Write-Host "  High     : $($State.High)"
    Write-Host "  Moderate : $($State.Moderate)"
    Write-Host "  Low      : $($State.Low)"

    if ($State.Names.Count -gt 0) {
        Write-Host "  Packages : $($State.Names -join ', ')"
    }
}

# ============================================================
# INSTALLED VERSIONS
# ============================================================

function Get-InstalledVersions {
    param([string]$PackageName)

    Push-Location $ProjectRoot

    try {

        $paths = @(
            & npm ls `
                $PackageName `
                --all `
                --parseable `
                2>$null
        )

        $versions =
            New-Object System.Collections.Generic.List[string]

        foreach ($path in $paths) {

            if (!$path) {
                continue
            }

            $packageJson = Join-Path $path "package.json"

            if (!(Test-Path $packageJson)) {
                continue
            }

            try {

                $obj = (
                    Get-Content `
                        -LiteralPath $packageJson `
                        -Raw |
                    ConvertFrom-Json
                )

                if (
                    $obj.name -eq $PackageName -and
                    $obj.version
                ) {
                    $versions.Add(
                        [string]$obj.version
                    ) | Out-Null
                }
            }
            catch {
            }
        }

        return @(
            $versions |
            Sort-Object -Unique
        )
    }
    finally {
        Pop-Location
    }
}

function Get-PackageSection {
    param([string]$PackageName)

    $package = (
        Get-Content `
            (Join-Path $ProjectRoot "package.json") `
            -Raw |
        ConvertFrom-Json
    )

    if ($null -ne $package.dependencies) {

        $names = @(
            $package.dependencies.PSObject.Properties.Name
        )

        if ($names -contains $PackageName) {
            return "dependencies"
        }
    }

    if ($null -ne $package.devDependencies) {

        $names = @(
            $package.devDependencies.PSObject.Properties.Name
        )

        if ($names -contains $PackageName) {
            return "devDependencies"
        }
    }

    return "transitive"
}

# ============================================================
# PATCHED VERSION MAP
# ============================================================

function Get-PatchedVersion {
    param(
        [string]$PackageName,
        [int]$Major
    )

    switch ($PackageName) {

        "brace-expansion" {

            switch ($Major) {
                1 { return "1.1.18" }
                2 { return "2.1.4" }
                3 { return "3.0.6" }
                5 { return "5.0.9" }
                default { return $null }
            }
        }

        "minimatch" {

            switch ($Major) {
                3  { return "3.1.4" }
                4  { return "4.2.5" }
                5  { return "5.1.8" }
                6  { return "6.2.2" }
                7  { return "7.4.8" }
                8  { return "8.0.6" }
                9  { return "9.0.7" }
                10 { return "10.2.3" }
                default { return $null }
            }
        }

        "path-to-regexp" {

            switch ($Major) {
                0 { return "0.1.13" }
                1 { return "1.9.0" }
                3 { return "3.3.0" }
                6 { return "6.3.0" }
                8 { return "8.4.0" }
                default { return $null }
            }
        }

        "qs" {
            return "6.15.2"
        }

        "body-parser" {

            if ($Major -eq 1) {
                return "1.20.6"
            }

            if ($Major -eq 2) {
                return "2.3.0"
            }

            return $null
        }

        default {
            return $null
        }
    }
}

# ============================================================
# OVERRIDES
# ============================================================

function Set-NpmOverride {
    param(
        [string]$PackageName,
        [string]$Version
    )

    $env:CHATMI_OVERRIDE_NAME = $PackageName
    $env:CHATMI_OVERRIDE_VERSION = $Version

    Push-Location $ProjectRoot

    try {

        node -e @'
const fs = require("fs");

const file = "package.json";
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));

pkg.overrides ||= {};

pkg.overrides[
  process.env.CHATMI_OVERRIDE_NAME
] = process.env.CHATMI_OVERRIDE_VERSION;

fs.writeFileSync(
  file,
  JSON.stringify(pkg, null, 2) + "\n"
);
'@

        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo escribir override."
        }
    }
    finally {
        Pop-Location

        Remove-Item Env:CHATMI_OVERRIDE_NAME `
            -ErrorAction SilentlyContinue

        Remove-Item Env:CHATMI_OVERRIDE_VERSION `
            -ErrorAction SilentlyContinue
    }
}

# ============================================================
# TRIAL FIX
# ============================================================

function Try-PackageFix {
    param(
        [string]$PackageName
    )

    Section "PROBANDO FIX: $PackageName"

    $versions = @(
        Get-InstalledVersions $PackageName
    )

    if ($versions.Count -eq 0) {
        Warn "$PackageName no está instalado."
        return
    }

    Write-Host "Instalado: $($versions -join ', ')"

    $majors = @(
        $versions |
        ForEach-Object {
            try {
                [int](($_ -split '\.')[0])
            }
            catch {
            }
        } |
        Sort-Object -Unique
    )

    if ($majors.Count -ne 1) {

        Warn (
            "$PackageName tiene varias ramas major: " +
            ($majors -join ", ") +
            ". No forzaré override global."
        )

        return
    }

    $major = [int]$majors[0]

    $target = Get-PatchedVersion `
        -PackageName $PackageName `
        -Major $major

    if (!$target) {

        Warn (
            "No tengo parche same-major seguro " +
            "automatizado para $PackageName major $major."
        )

        return
    }

    Write-Host "Target seguro: $target" -ForegroundColor Cyan

    $trialBackup = Join-Path `
        $BackupRoot `
        ("trial-" + ($PackageName -replace "[^A-Za-z0-9]", "-"))

    Backup-Packages $trialBackup

    $before = Get-AuditState

    $section = Get-PackageSection $PackageName

    Push-Location $ProjectRoot

    try {

        if ($section -eq "dependencies") {

            Write-Host "Actualizando dependencia directa..." -ForegroundColor Gray

            npm install "$PackageName@$target" | Out-Host

            if ($LASTEXITCODE -ne 0) {
                throw "npm install falló."
            }
        }
        elseif ($section -eq "devDependencies") {

            Write-Host "Actualizando devDependency..." -ForegroundColor Gray

            npm install `
                --save-dev `
                "$PackageName@$target" |
                Out-Host

            if ($LASTEXITCODE -ne 0) {
                throw "npm install falló."
            }
        }
        else {

            Write-Host "Aplicando override transitive..." -ForegroundColor Gray

            Set-NpmOverride `
                -PackageName $PackageName `
                -Version $target

            npm install | Out-Host

            if ($LASTEXITCODE -ne 0) {
                throw "npm install con override falló."
            }
        }
    }
    catch {

        Warn "$PackageName no pudo instalarse."

        Restore-Packages $trialBackup

        return
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "Validando proyecto..." -ForegroundColor Gray

    if (!(Test-Project)) {

        Warn "$PackageName@$target rompe validación. Rollback."

        Restore-Packages $trialBackup

        if (!(Test-Project)) {
            throw "Rollback de $PackageName falló."
        }

        OK "Rollback confirmado."

        return
    }

    $after = Get-AuditState

    Show-AuditState "Antes" $before
    Show-AuditState "Después" $after

    if ($after.Score -lt $before.Score) {

        Changed "$PackageName@$target CONSERVADO."
    }
    else {

        Warn (
            "$PackageName@$target no redujo " +
            "el riesgo del audit. Rollback."
        )

        Restore-Packages $trialBackup

        if (!(Test-Project)) {
            throw "Rollback de $PackageName falló."
        }
    }
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI HARDENING FASE 5 — $Version" -ForegroundColor Cyan
Write-Host " Seguridad transitive + typing seguro + diagnostico final" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto: $ProjectRoot" -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    throw "Proyecto no encontrado."
}

Set-Location $ProjectRoot

New-Item `
    -ItemType Directory `
    -Path $BackupRoot `
    -Force |
    Out-Null

New-Item `
    -ItemType Directory `
    -Path $ReportsDir `
    -Force |
    Out-Null

# ============================================================
# 1. BASELINE
# ============================================================

Section "1. BASELINE"

if (!(Test-Project)) {
    throw "El proyecto no parte de un estado válido."
}

OK "TypeScript + tests + build correctos."

# ============================================================
# 2. MASTER BACKUP
# ============================================================

Section "2. BACKUP MAESTRO"

Copy-Item `
    (Join-Path $ProjectRoot "src") `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

Backup-Packages `
    (Join-Path $BackupRoot "packages-original")

OK "Backup creado:"
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. AUDIT BEFORE
# ============================================================

Section "3. AUDIT PRODUCCION INICIAL"

$initialAudit = Get-AuditState

Show-AuditState "Estado inicial" $initialAudit

$auditReport = Join-Path `
    $ReportsDir `
    "audit-produccion-fase5-$Stamp.txt"

npm audit --omit=dev |
    Set-Content `
        -LiteralPath $auditReport `
        -Encoding UTF8

OK "Audit guardado:"
Write-Host $auditReport -ForegroundColor DarkGray

# ============================================================
# 4. EXPLAIN VULNERABLE TREE
# ============================================================

Section "4. MAPA DE DEPENDENCIAS VULNERABLES"

$explainReport = Join-Path `
    $ReportsDir `
    "npm-explain-vulnerables-$Stamp.txt"

"" |
    Set-Content `
        -LiteralPath $explainReport `
        -Encoding UTF8

foreach ($name in $initialAudit.Names) {

    Write-Host ""
    Write-Host ">>> npm explain $name" -ForegroundColor Yellow

    Add-Content `
        -LiteralPath $explainReport `
        -Value "`n=================================================`n$name`n================================================="

    $explain = (
        & npm explain $name 2>&1 |
        Out-String
    )

    Write-Host $explain

    Add-Content `
        -LiteralPath $explainReport `
        -Value $explain
}

# ============================================================
# 5. FIX KNOWN VULNERABLE PACKAGES
# ============================================================

Section "5. CORRECCION QUIRURGICA"

$knownCandidates = @(
    "brace-expansion",
    "minimatch",
    "path-to-regexp",
    "qs",
    "body-parser"
)

$currentAudit = Get-AuditState

foreach ($candidate in $knownCandidates) {

    if ($currentAudit.Names -contains $candidate) {

        Try-PackageFix `
            -PackageName $candidate

        $currentAudit = Get-AuditState
    }
}

# ============================================================
# 6. AUDIT AFTER SECURITY
# ============================================================

Section "6. AUDIT DESPUES DE SEGURIDAD"

$securityAudit = Get-AuditState

Show-AuditState "Seguridad actual" $securityAudit

# ============================================================
# 7. ACTIVITYTYPE DUPLICATION
# ============================================================

Section "7. ACTIVITYTYPE"

$activityService = Join-Path `
    $ProjectRoot `
    "src\services\activityService.ts"

if (Test-Path $activityService) {

    $original = Read-Text $activityService
    $candidate = $original

    $candidate = $candidate.Replace(
        "import type { ActivityType as SharedActivityType } from '../types';",
        "import type { ActivityType } from '../types';"
    )

    $candidate = $candidate.Replace(
        "export type ActivityType = SharedActivityType;",
        "export type { ActivityType } from '../types';"
    )

    if ($candidate -ne $original) {

        Write-Text `
            -Path $activityService `
            -Content $candidate

        if (Test-TypeScript) {

            Changed "ActivityType centralizado."
        }
        else {

            Write-Text `
                -Path $activityService `
                -Content $original

            Warn "Cambio ActivityType revertido."
        }
    }
    else {

        Warn "No encontré patrón conocido de ActivityType."
    }
}

# ============================================================
# 8. SAFE ANY REDUCTION
# ============================================================

Section "8. REDUCCION SEGURA DE ANY"

$transformations = @(
    @{
        Pattern = 'Record<string,\s*any>'
        Replacement = 'Record<string, unknown>'
    },
    @{
        Pattern = 'Array<any>'
        Replacement = 'Array<unknown>'
    },
    @{
        Pattern = 'Promise<any>'
        Replacement = 'Promise<unknown>'
    },
    @{
        Pattern = '\bany\[\]'
        Replacement = 'unknown[]'
    }
)

foreach ($file in @(Get-SrcFiles)) {

    $original = Read-Text $file.FullName
    $candidate = $original

    foreach ($transformation in $transformations) {

        $candidate = [regex]::Replace(
            $candidate,
            $transformation.Pattern,
            $transformation.Replacement
        )
    }

    if ($candidate -eq $original) {
        continue
    }

    Write-Text `
        -Path $file.FullName `
        -Content $candidate

    if (Test-TypeScript) {

        Changed "Typing seguro: $($file.Name)"
    }
    else {

        Write-Text `
            -Path $file.FullName `
            -Content $original

        Write-Host (
            "[REV] $($file.Name)"
        ) -ForegroundColor DarkYellow
    }
}

# ============================================================
# 9. REPORT ANY
# ============================================================

Section "9. BACKLOG DE TYPING"

$anyMatches = @(
    Get-SrcFiles |
    Select-String `
        -Pattern '(:\s*any\b|\bas\s+any\b|<any>)' `
        -ErrorAction SilentlyContinue
)

$anyReport = Join-Path `
    $ReportsDir `
    "any-restante-$Stamp.txt"

$anyMatches |
    ForEach-Object {

        "{0}:{1} -> {2}" -f `
            $_.Path,
            $_.LineNumber,
            $_.Line.Trim()

    } |
    Set-Content `
        -LiteralPath $anyReport `
        -Encoding UTF8

Write-Host "ANY restantes: $($anyMatches.Count)"

# ============================================================
# 10. LOG REPORT
# ============================================================

Section "10. ANALISIS DE LOGS"

$logMatches = @(
    Get-SrcFiles |
    Select-String `
        -Pattern 'console\.(log|info|warn|error)' `
        -ErrorAction SilentlyContinue
)

$sensitiveMatches = @(
    Get-SrcFiles |
    Select-String `
        -Pattern 'console\.(log|info|warn|error).*?(password|access_token|refresh_token|api[_-]?key)' `
        -ErrorAction SilentlyContinue
)

$logReport = Join-Path `
    $ReportsDir `
    "logs-restantes-$Stamp.txt"

$logMatches |
    ForEach-Object {

        "{0}:{1} -> {2}" -f `
            $_.Path,
            $_.LineNumber,
            $_.Line.Trim()

    } |
    Set-Content `
        -LiteralPath $logReport `
        -Encoding UTF8

$sensitiveReport = Join-Path `
    $ReportsDir `
    "logs-sensibles-$Stamp.txt"

$sensitiveMatches |
    ForEach-Object {

        "{0}:{1} -> {2}" -f `
            $_.Path,
            $_.LineNumber,
            $_.Line.Trim()

    } |
    Set-Content `
        -LiteralPath $sensitiveReport `
        -Encoding UTF8

Write-Host "Logs totales     : $($logMatches.Count)"
Write-Host "Logs sospechosos : $($sensitiveMatches.Count)"

# ============================================================
# 11. FINAL VALIDATION
# ============================================================

Section "11. VALIDACION FINAL"

if (!(Test-Project)) {

    Fail "La validación final falló."

    throw (
        "No se ejecutará el scanner hasta " +
        "corregir el fallo final."
    )
}

OK "TypeScript OK."
OK "Tests OK."
OK "Build OK."

# ============================================================
# 12. FINAL AUDIT
# ============================================================

Section "12. AUDIT FINAL PRODUCCION"

$finalAudit = Get-AuditState

Show-AuditState "Estado final" $finalAudit

npm audit --omit=dev | Out-Host

# ============================================================
# 13. SCANNER
# ============================================================

Section "13. NUEVA PUNTUACION"

if (Test-Path $Scanner) {

    powershell `
        -ExecutionPolicy Bypass `
        -File $Scanner `
        -ProjectRoot $ProjectRoot
}
else {

    Warn "No encontré evaluar-chatmi-v2.ps1"
}

# ============================================================
# END
# ============================================================

Section "FASE 5 TERMINADA"

Write-Host ""
Write-Host "Backup:" -ForegroundColor White
Write-Host $BackupRoot -ForegroundColor Cyan

Write-Host ""
Write-Host "Audit:" -ForegroundColor White
Write-Host $auditReport -ForegroundColor Cyan

Write-Host ""
Write-Host "Mapa vulnerabilidades:" -ForegroundColor White
Write-Host $explainReport -ForegroundColor Cyan

Write-Host ""
Write-Host "ANY restante:" -ForegroundColor White
Write-Host $anyReport -ForegroundColor Cyan

Write-Host ""
Write-Host "Logs:" -ForegroundColor White
Write-Host $logReport -ForegroundColor Cyan

Write-Host ""
Write-Host "Logs sensibles:" -ForegroundColor White
Write-Host $sensitiveReport -ForegroundColor Cyan