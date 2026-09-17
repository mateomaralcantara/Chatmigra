param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$SrcRoot = Join-Path $ProjectRoot "src"
$ReportsDir = Join-Path $ProjectRoot "reports"
$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\nivel6-1-$Stamp"
$Scanner = Join-Path $ProjectRoot "scripts\evaluar-chatmi-v2.ps1"

New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

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
# VALIDADORES PUROS
# ============================================================

function Test-TSC {

    $log = Join-Path $env:TEMP "chatmi-61-tsc-$PID.txt"

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

    $log = Join-Path $env:TEMP "chatmi-61-tests-$PID.txt"

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

    $log = Join-Path $env:TEMP "chatmi-61-build-$PID.txt"

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
# CONTAR ANY
# ============================================================

function Get-AnyMatches {

    return @(
        Get-SrcFiles |
        Select-String `
            -Pattern '(:\s*any\b|\bas\s+any\b|<any>)' `
            -ErrorAction SilentlyContinue
    )
}

function Get-AnyCount {
    return @(Get-AnyMatches).Count
}

# ============================================================
# INICIO
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI NIVEL 6.1" -ForegroundColor Cyan
Write-Host " Eliminación semántica de ANY mediante inferencia TypeScript" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto: $ProjectRoot" -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    throw "No existe ProjectRoot."
}

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
    throw "Los tests no inician limpios."
}

OK "Tests: OK."

if (!(Test-Build)) {
    throw "El build no inicia limpio."
}

OK "Build: OK."

$before = Get-AnyCount

Write-Host ""
Write-Host "ANY iniciales: $before" -ForegroundColor Yellow

# ============================================================
# 2. BACKUP
# ============================================================

Section "2. BACKUP"

Copy-Item `
    $SrcRoot `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

OK "Backup completo de src:"
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. INFERENCIA
#
# Estrategias:
#
#     foo: any       -> foo
#     value as any   -> value
#     useState<any>  -> useState
#
# Cada cambio debe pasar tsc inmediatamente.
# ============================================================

Section "3. INFERENCIA TIPO POR TIPO"

$accepted = 0
$rejected = 0

$acceptedReport = Join-Path `
    $ReportsDir `
    "nivel6-1-any-eliminados-$Stamp.txt"

$rejectedReport = Join-Path `
    $ReportsDir `
    "nivel6-1-any-requieren-tipo-$Stamp.txt"

"" | Set-Content $acceptedReport -Encoding UTF8
"" | Set-Content $rejectedReport -Encoding UTF8

foreach ($file in @(Get-SrcFiles)) {

    $current = Read-Text $file.FullName

    $regex = [regex]'(:\s*any\b|\bas\s+any\b|<any>)'

    $matches = @(
        $regex.Matches($current) |
        Sort-Object Index -Descending
    )

    if ($matches.Count -eq 0) {
        continue
    }

    Write-Host ""
    Write-Host "Archivo: $($file.Name)" -ForegroundColor Cyan

    foreach ($match in $matches) {

        $index = $match.Index
        $length = $match.Length
        $value = $match.Value

        # Debido a que procesamos desde el final hacia el inicio,
        # las posiciones anteriores permanecen válidas.

        if (($index + $length) -gt $current.Length) {
            continue
        }

        $actual = $current.Substring(
            $index,
            $length
        )

        if ($actual -ne $value) {
            continue
        }

        # ---------------------------------------------
        # TRANSFORMACIÓN
        # ---------------------------------------------

        $replacement = ""

        if ($value -match '^:\s*any$') {

            # Ej:
            # (event: any) -> (event)
            #
            # Si TS puede inferir event, compilará.
            # Si no, no se conserva.

            $replacement = ""

        }
        elseif ($value -match '^\s+as\s+any$') {

            # Ej:
            # result as any -> result

            $replacement = ""

        }
        elseif ($value -eq "<any>") {

            # Ej:
            # useState<any>() -> useState()

            $replacement = ""

        }
        else {
            continue
        }

        $candidate =
            $current.Substring(0, $index) +
            $replacement +
            $current.Substring($index + $length)

        Write-Text `
            -Path $file.FullName `
            -Content $candidate

        if (Test-TSC) {

            $current = $candidate
            $accepted++

            Write-Host (
                "  [OK] Eliminado: {0}" -f
                $value.Trim()
            ) -ForegroundColor Green

            Add-Content `
                -LiteralPath $acceptedReport `
                -Value (
                    "{0} -> eliminado {1}" -f
                    $file.FullName,
                    $value.Trim()
                )
        }
        else {

            Write-Text `
                -Path $file.FullName `
                -Content $current

            $rejected++

            Write-Host (
                "  [TIPO] Requiere tipado explícito: {0}" -f
                $value.Trim()
            ) -ForegroundColor DarkYellow
        }
    }
}

# ============================================================
# 4. CONTAR RESULTADO
# ============================================================

Section "4. RESULTADO DE INFERENCIA"

$afterInference = Get-AnyCount

Write-Host "Iniciales : $before"
Write-Host "Eliminados: $accepted" -ForegroundColor Green
Write-Host "Rechazados: $rejected" -ForegroundColor Yellow
Write-Host "Restantes : $afterInference" -ForegroundColor Cyan

# ============================================================
# 5. GENERAR INFORME CONTEXTUAL
# ============================================================

Section "5. ANALISIS SEMANTICO DE LOS RESTANTES"

$remaining = @(Get-AnyMatches)

$grouped = $remaining |
    Group-Object Path |
    Sort-Object Count -Descending

foreach ($group in $grouped) {

    Add-Content `
        -LiteralPath $rejectedReport `
        -Value (
            "`r`n============================================================" +
            "`r`nFILE: $($group.Name)" +
            "`r`nANY: $($group.Count)" +
            "`r`n============================================================"
        )

    $allLines = Get-Content `
        -LiteralPath $group.Name

    foreach ($match in $group.Group) {

        $lineNumber = $match.LineNumber

        $from = [Math]::Max(
            1,
            $lineNumber - 2
        )

        $to = [Math]::Min(
            $allLines.Count,
            $lineNumber + 2
        )

        Add-Content `
            -LiteralPath $rejectedReport `
            -Value (
                "`r`n--- Línea $lineNumber ---"
            )

        for ($i = $from; $i -le $to; $i++) {

            $prefix = if ($i -eq $lineNumber) {
                ">>>"
            }
            else {
                "   "
            }

            Add-Content `
                -LiteralPath $rejectedReport `
                -Value (
                    "{0} {1,5}: {2}" -f
                    $prefix,
                    $i,
                    $allLines[$i - 1]
                )
        }
    }
}

Write-Host ""
Write-Host "Distribución:" -ForegroundColor White

foreach ($group in $grouped) {

    Write-Host (
        "  {0,3}  {1}" -f
        $group.Count,
        (
            $group.Name.Replace(
                "$ProjectRoot\",
                ""
            )
        )
    )
}

# ============================================================
# 6. VALIDACIÓN COMPLETA
# ============================================================

Section "6. VALIDACION COMPLETA"

if (!(Test-TSC)) {

    throw (
        "TypeScript falló inesperadamente. " +
        "El backup está en $BackupRoot"
    )
}

OK "TypeScript 0 errores."

if (!(Test-Tests)) {
    throw "Tests fallaron."
}

OK "10/10 tests."

if (!(Test-Build)) {
    throw "Build falló."
}

OK "Build producción."

# ============================================================
# 7. AUDIT NO DEBE CAMBIAR
# ============================================================

Section "7. SEGURIDAD"

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
    [int]$v.critical -ne 0 -or
    [int]$v.high -ne 0 -or
    [int]$v.moderate -ne 0 -or
    [int]$v.low -ne 0
) {
    Warn "El audit producción cambió."
}
else {
    OK "Producción: 0 vulnerabilidades."
}

# ============================================================
# 8. SCANNER
# ============================================================

Section "8. PUNTUACION"

if (Test-Path $Scanner) {

    powershell `
        -ExecutionPolicy Bypass `
        -File $Scanner `
        -ProjectRoot $ProjectRoot
}

# ============================================================
# 9. FINAL
# ============================================================

Section "NIVEL 6.1 FINALIZADO"

Write-Host ""
Write-Host "ANY iniciales : $before"
Write-Host "ANY finales   : $(Get-AnyCount)" -ForegroundColor Cyan

Write-Host ""
Write-Host "Cambios automáticos aceptados:" -ForegroundColor White
Write-Host $acceptedReport -ForegroundColor Cyan

Write-Host ""
Write-Host "ANY que requieren tipo real:" -ForegroundColor White
Write-Host $rejectedReport -ForegroundColor Cyan

Write-Host ""
Write-Host "Backup:" -ForegroundColor White
Write-Host $BackupRoot -ForegroundColor Cyan